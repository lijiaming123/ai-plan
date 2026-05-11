/**
 * 认证与用户态路由（均挂在同一 Fastify 前缀根路径，无前缀）。
 *
 * - POST /auth/login：Body `{ phone, password }`（普通用户）或 `{ email, password }`（管理端/演示邮箱）。普通用户须已在注册时设置密码。
 * - POST /auth/forgot-password：Body `{ email }`；演示环境不发送邮件，统一返回成功说明（防枚举）。
 * - POST /auth/admin/register：演示自助注册（需 ADMIN_OPEN_REGISTER=true），返回 `{ token }`。
 * - GET /auth/admin/me：需 admin JWT，返回 email / permissions。
 * - GET /auth/me：需 user 角色 JWT；返回 sub/email/role，并附带库表 planTier 与本月 aiQuota 摘要（若有 User 行）。
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
import { createCaptchaSession, verifyCaptchaAnswer } from './captcha.service';
import { normalizePhoneCN, sendOtp, verifyOtp } from './otp.service';
import {
  getAiQuotaStatus,
  resolveEffectivePlanTier,
} from '../billing/ai-quota.service';
import { prisma } from '../../lib/prisma';

async function appUserProExpiresAtIso(userId: string): Promise<string | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { proExpiresAt: true },
  });
  return row?.proExpiresAt?.toISOString() ?? null;
}

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

  /** 图形验证码：用于短信发送前人机校验（内存会话，约 5 分钟有效） */
  fastify.get('/auth/captcha', async () => createCaptchaSession());

  /**
   * 手机验证码发送（商业化普通版主路径）。
   * 说明：生产应接真实短信服务；测试环境会返回 codeForTest 便于闭环测试。
   * 须先 GET /auth/captcha，再在 body 中携带 captchaId、captchaText。
   */
  fastify.post('/auth/otp/send', async (request, reply) => {
    const body = request.body as
      | { phone?: unknown; purpose?: unknown; captchaId?: unknown; captchaText?: unknown }
      | undefined;
    const captchaId = String(body?.captchaId ?? '').trim();
    const captchaText = String(body?.captchaText ?? '').trim();
    if (!captchaId || !captchaText) {
      return reply.code(400).send({ message: '请先完成图形验证码' });
    }
    if (!verifyCaptchaAnswer(captchaId, captchaText)) {
      return reply.code(400).send({ message: '图形验证码错误或已过期，请刷新后重试' });
    }
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
    const planTier = await resolveEffectivePlanTier(result.userId);
    const aiQuota = await getAiQuotaStatus(result.userId);
    const proExpiresAt = await appUserProExpiresAtIso(result.userId);
    return {
      token: fastify.jwt.sign({
        sub: result.userId,
        // 兼容旧前端：先把 phone 写入 email 字段，前端切换完成后再清理
        email: result.phone,
        role: 'user',
      }),
      phone: result.phone,
      userId: result.userId,
      planTier,
      proExpiresAt,
      aiQuota: aiQuota
        ? {
            used: aiQuota.used,
            limit: aiQuota.limit,
            yearMonth: aiQuota.yearMonth,
          }
        : null,
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
        const planTier = await resolveEffectivePlanTier(appUser.id);
        const aiQuota = await getAiQuotaStatus(appUser.id);
        const proExpiresAt = await appUserProExpiresAtIso(appUser.id);
        return {
          token: fastify.jwt.sign({
            sub: appUser.id,
            email: appUser.email,
            role: 'user',
          }),
          planTier,
          proExpiresAt,
          aiQuota: aiQuota
            ? {
                used: aiQuota.used,
                limit: aiQuota.limit,
                yearMonth: aiQuota.yearMonth,
              }
            : null,
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
    const planTier = await resolveEffectivePlanTier(payload.sub);
    const aiQuota = await getAiQuotaStatus(payload.sub);
    const proExpiresAt = await appUserProExpiresAtIso(payload.sub);
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      permissions: payload.permissions,
      planTier,
      proExpiresAt,
      aiQuota: aiQuota
        ? {
            used: aiQuota.used,
            limit: aiQuota.limit,
            yearMonth: aiQuota.yearMonth,
          }
        : null,
    };
  });

  fastify.get('/admin/secret', { preHandler: fastify.requireRole('admin') }, async () => {
    return { ok: true };
  });
}
