/**
 * 鉴权插件：扩展 Fastify 实例，提供 `requireRole` 工厂函数。
 *
 * 工作流程：
 * 1. 路由配置 `preHandler: fastify.requireRole('user')` 或 `'admin'`。
 * 2. preHandler 内调用 `request.jwtVerify()`：校验 `Authorization: Bearer <token>`，失败由 @fastify/jwt 返回 401。
 * 3. 读取 payload.role：必须与期望角色完全一致（user 与 admin 互不通用；需要「任一登录用户」的路由应单独写 preHandler 只 jwtVerify 不比对 role）。
 *
 * JWT payload 字段由登录路由 `jwt.sign` 写入，需与 `src/types/jwt.d.ts` 一致（sub / email / role）。
 */
import type { FastifyReply, FastifyRequest, FastifyInstance } from 'fastify';
import { ADMIN_PERMISSIONS, type AdminPermission } from '../modules/admin/admin-permissions';

declare module 'fastify' {
  interface FastifyInstance {
    requireRole: (role: 'user' | 'admin') => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (
      permission: AdminPermission,
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function authPlugin(fastify: FastifyInstance) {
  fastify.decorate('requireRole', (role: 'user' | 'admin') => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = await request.jwtVerify<{ role: 'user' | 'admin' }>();
      if (payload.role !== role) {
        return reply.code(403).send({ message: 'Forbidden' });
      }
    };
  });

  fastify.decorate('requirePermission', (permission: AdminPermission) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = await request.jwtVerify<{
        role: 'user' | 'admin';
        permissions?: string[];
      }>();

      if (payload.role !== 'admin') {
        return reply.code(403).send({ message: 'Forbidden' });
      }

      // permissions:
      // - undefined: 兼容旧 token（admin 默认全量权限）
      // - []: 显式无权限（用于最小授权/测试）
      const effective = payload.permissions ?? ADMIN_PERMISSIONS;
      if (!effective.includes(permission)) {
        return reply.code(403).send({ message: 'Forbidden' });
      }
    };
  });
}
