import type { FastifyInstance } from 'fastify';
import type { AdminAccountPresetKey } from './admin-account-presets';
import {
  createAdminAccount,
  listAdminAccounts,
  resetAdminAccountPassword,
  updateAdminAccount,
} from './admin-accounts.service';
import { writeAuditLog } from './audit-log.service';

export async function registerAdminAccountsRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/admin/admin-users',
    { preHandler: fastify.requirePermission('rbac:manage') },
    async () => {
      const items = await listAdminAccounts();
      return { items };
    },
  );

  fastify.post(
    '/admin/admin-users',
    { preHandler: fastify.requirePermission('rbac:manage') },
    async (request, reply) => {
      const actor = await request.jwtVerify<{ sub: string; email: string }>();
      const body = request.body as {
        loginId?: string;
        email?: string | null;
        password?: string;
        presetKey?: AdminAccountPresetKey;
        permissions?: string[];
      };

      const result = await createAdminAccount({
        loginId: String(body?.loginId ?? ''),
        email: body?.email,
        password: String(body?.password ?? ''),
        presetKey: body?.presetKey,
        permissions: body?.permissions,
      });

      if (!result.ok) {
        return reply.code(400).send({ message: result.message });
      }

      await writeAuditLog({
        actorId: actor.sub,
        actorEmail: actor.email,
        action: 'rbac.admin.create',
        targetType: 'AdminUser',
        targetId: result.account.id,
        summary: `loginId=${result.account.loginId}`,
        meta: { permissions: result.account.permissions },
        request,
      });

      return result.account;
    },
  );

  fastify.patch(
    '/admin/admin-users/:id',
    { preHandler: fastify.requirePermission('rbac:manage') },
    async (request, reply) => {
      const actor = await request.jwtVerify<{ sub: string; email: string }>();
      const { id } = request.params as { id: string };
      const body = request.body as {
        email?: string | null;
        presetKey?: AdminAccountPresetKey;
        permissions?: string[];
        disabled?: boolean;
      };

      const result = await updateAdminAccount({
        id,
        actorId: actor.sub,
        email: body?.email,
        presetKey: body?.presetKey,
        permissions: body?.permissions,
        disabled: body?.disabled,
      });

      if (!result.ok) {
        const code = result.message.includes('不能禁用') ? 400 : 404;
        return reply.code(code).send({ message: result.message });
      }

      let action: 'rbac.admin.update' | 'rbac.admin.disable' | 'rbac.admin.enable' = 'rbac.admin.update';
      if (body?.disabled === true) action = 'rbac.admin.disable';
      if (body?.disabled === false) action = 'rbac.admin.enable';

      await writeAuditLog({
        actorId: actor.sub,
        actorEmail: actor.email,
        action,
        targetType: 'AdminUser',
        targetId: id,
        summary: `loginId=${result.account.loginId}`,
        meta: {
          before: result.previous.permissions,
          after: result.account.permissions,
          disabledAt: result.account.disabledAt,
        },
        request,
      });

      return result.account;
    },
  );

  fastify.post(
    '/admin/admin-users/:id/reset-password',
    { preHandler: fastify.requirePermission('rbac:manage') },
    async (request, reply) => {
      const actor = await request.jwtVerify<{ sub: string; email: string }>();
      const { id } = request.params as { id: string };
      const body = request.body as { newPassword?: string };

      const result = await resetAdminAccountPassword({
        id,
        newPassword: String(body?.newPassword ?? ''),
      });

      if (!result.ok) {
        return reply.code(result.message === '账号不存在' ? 404 : 400).send({ message: result.message });
      }

      await writeAuditLog({
        actorId: actor.sub,
        actorEmail: actor.email,
        action: 'rbac.admin.reset_password',
        targetType: 'AdminUser',
        targetId: id,
        summary: `loginId=${result.loginId}`,
        request,
      });

      return { ok: true };
    },
  );
}
