/**
 * 认证与用户态路由（均挂在同一 Fastify 前缀根路径，无前缀）。
 *
 * - POST /auth/login：Body `{ email, password }`，成功返回 `{ token }`（HS256 JWT）。
 * - POST /auth/admin/register：演示自助注册（需 ADMIN_OPEN_REGISTER=true），返回 `{ token }`。
 * - GET /auth/admin/me：需 admin JWT，返回 email / permissions。
 * - GET /auth/me：需 user 角色 JWT，回显 token 中的 sub/email/role（不做库表查询）。
 * - GET /admin/secret：需 admin 角色，健康/探活用途；与 admin.routes 下业务接口分离。
 */
import type { FastifyInstance } from 'fastify';
import { ADMIN_PERMISSIONS } from '../admin/admin-permissions';
import { authenticateUser, registerAdmin } from './auth.service';

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

  /** 登录：优先 AdminUser（账号或邮箱），无记录时回退 DEMO_USERS（本地演示） */
  fastify.post('/auth/login', async (request, reply) => {
    const body = request.body as { email?: string; password?: string } | undefined;
    const user = await authenticateUser({
      email: body?.email ?? '',
      password: body?.password ?? '',
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
