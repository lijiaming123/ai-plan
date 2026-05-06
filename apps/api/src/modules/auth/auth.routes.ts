/**
 * 认证与用户态路由（均挂在同一 Fastify 前缀根路径，无前缀）。
 *
 * - POST /auth/login：Body `{ phone, password }`（普通用户）或 `{ email, password }`（管理端/演示邮箱）。普通用户须已在注册时设置密码。
 * - POST /auth/forgot-password：Body `{ email }`；演示环境不发送邮件，统一返回成功说明（防枚举）。
 * - POST /auth/admin/register：演示自助注册（需 ADMIN_OPEN_REGISTER=true），返回 `{ token }`。
 * - GET /auth/admin/me：需 admin JWT，返回 email / permissions。
 * - GET /auth/me：需 user 角色 JWT，回显 token 中的 sub/email/role（不做库表查询）。
 * - GET /admin/secret：需 admin 角色，健康/探活用途；与 admin.routes 下业务接口分离。
 */
import type { FastifyInstance } from 'fastify';
import { ADMIN_PERMISSIONS } from '../admin/admin-permissions';
import {
  authenticateAppUserByPhonePassword,
  authenticateUser,
  registerAdmin,
  requestPasswordResetDemo,
  validateForgotPasswordEmail,
} from './auth.service';
import { normalizePhoneCN, sendOtp, verifyOtp } from './otp.service';

export async function registerAuthRoutes(fastify: FastifyInstance) {
  /**
   * 管理端自助注册（默认关闭）。
   * 需环境变量 ADMIN_OPEN_REGISTER=true；账号写入 AdminUser 表（需迁移 + 可用数据库）。
   */
  fastify.post('/auth/admin/register', async (request, reply) => {
    const body = request.body as
      | { email?: string; password?: string; preset?: 'analyst' | 'auditor' }
      | undefined;
    const reg = await registerAdmin({
      email: body?.email ?? '',
      password: body?.password ?? '',
      preset: body?.preset,
    });
    if (!reg.ok) {
      const code = reg.message.includes('未开放') ? 403 : 400;
      return reply.code(code).send({ message: reg.message });
    }
    const user = await authenticateUser({
      email: reg.email,
      password: String(body?.password ?? ''),
    });
    if (!user) {
      return reply.code(500).send({ message: 'Registration failed' });
    }
    return {
      token: fastify.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
      }),
    };
  });

  /** 管理端当前登录者摘要（需 admin JWT） */
  fastify.get('/auth/admin/me', { preHandler: fastify.requireRole('admin') }, async (request) => {
    const payload = await request.jwtVerify<{
      sub: string;
      email: string;
      role: 'user' | 'admin';
      permissions?: string[];
    }>();
    const permissions = payload.permissions ?? ADMIN_PERMISSIONS;
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      permissions,
    };
  });

  fastify.post('/auth/forgot-password', async (request, reply) => {
    const body = request.body as { email?: string } | undefined;
    const email = validateForgotPasswordEmail(body?.email ?? '');
    if (!email) {
      return reply.code(400).send({ message: '请输入有效邮箱地址' });
    }
    return requestPasswordResetDemo(email);
  });

  /**
   * 手机验证码发送（商业化普通版主路径）。
   * 说明：生产应接真实短信服务；测试环境会返回 codeForTest 便于闭环测试。
   */
  fastify.post('/auth/otp/send', async (request, reply) => {
    const body = request.body as { phone?: unknown; purpose?: unknown } | undefined;
    const result = await sendOtp({
      phoneRaw: body?.phone,
      purposeRaw: body?.purpose,
    });
    if (!result.ok) {
      return reply.code(result.code).send({ message: result.message, cooldownSeconds: result.cooldownSeconds });
    }
    return result;
  });

  /** 手机验证码校验并签发 user JWT；register / reset 需同时提交 password、passwordConfirm */
  fastify.post('/auth/otp/verify', async (request, reply) => {
    const body = request.body as {
      phone?: unknown;
      purpose?: unknown;
      code?: unknown;
      password?: unknown;
      passwordConfirm?: unknown;
    } | undefined;
    const result = await verifyOtp({
      phoneRaw: body?.phone,
      purposeRaw: body?.purpose,
      codeRaw: body?.code,
      passwordRaw: body?.password,
      passwordConfirmRaw: body?.passwordConfirm,
    });
    if (!result.ok) {
      return reply.code(result.code).send({ message: result.message });
    }
    return {
      token: fastify.jwt.sign({
        sub: result.userId,
        // 兼容旧前端：先把 phone 写入 email 字段，前端切换完成后再清理
        email: result.phone,
        role: 'user',
      }),
      phone: result.phone,
      userId: result.userId,
    };
  });

  /**
   * 登录：若 body 含有效手机号则校验 User 表密码；否则走管理端邮箱/演示账号（authenticateUser）。
   */
  fastify.post('/auth/login', async (request, reply) => {
    const body = request.body as { email?: string; phone?: string; password?: string } | undefined;
    const password = String(body?.password ?? '');
    const phone = normalizePhoneCN(String(body?.phone ?? ''));
    if (phone) {
      const appUser = await authenticateAppUserByPhonePassword(phone, password);
      if (appUser) {
        return {
          token: fastify.jwt.sign({
            sub: appUser.id,
            email: appUser.email,
            role: 'user',
          }),
        };
      }
      return reply.code(401).send({ message: '手机号或密码错误' });
    }

    const user = await authenticateUser({
      email: body?.email ?? '',
      password,
    });

    if (!user) {
      return reply.code(401).send({ message: 'Invalid credentials' });
    }

    return {
      token: fastify.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
      }),
    };
  });

  fastify.get('/auth/me', { preHandler: fastify.requireRole('user') }, async (request) => {
    const payload = await request.jwtVerify<{
      sub: string;
      email: string;
      role: 'user' | 'admin';
      permissions?: string[];
    }>();
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      permissions: payload.permissions,
    };
  });

  fastify.get('/admin/secret', { preHandler: fastify.requireRole('admin') }, async () => {
    return { ok: true };
  });
}
