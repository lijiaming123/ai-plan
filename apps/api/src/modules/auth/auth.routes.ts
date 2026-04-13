/**
 * 认证与用户态路由（均挂在同一 Fastify 前缀根路径，无前缀）。
 *
 * - POST /auth/login：Body `{ email, password }`，成功返回 `{ token }`（HS256 JWT）。
 * - GET /auth/me：需 user 角色 JWT，回显 token 中的 sub/email/role（不做库表查询）。
 * - GET /admin/secret：需 admin 角色，健康/探活用途；与 admin.routes 下业务接口分离。
 */
import type { FastifyInstance } from 'fastify';
import { authenticateUser } from './auth.service';

export async function registerAuthRoutes(fastify: FastifyInstance) {
  /** 演示环境登录：凭证见 auth.service DEMO_USERS */
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
      }),
    };
  });

  fastify.get('/auth/me', { preHandler: fastify.requireRole('user') }, async (request) => {
    const payload = await request.jwtVerify<{ sub: string; email: string; role: 'user' | 'admin' }>();
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  });

  fastify.get('/admin/secret', { preHandler: fastify.requireRole('admin') }, async () => {
    return { ok: true };
  });
}
