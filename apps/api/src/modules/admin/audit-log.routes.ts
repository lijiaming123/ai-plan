import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';
import { ADMIN_PERMISSIONS } from './admin-permissions';
import { writeAuditLog } from './audit-log.service';

function parseLimit(input: unknown) {
  const n = Number(input ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(Math.floor(n), 200);
}

export async function registerAuditLogRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/admin/audit-logs',
    { preHandler: fastify.requirePermission('audit:read') },
    async (request) => {
      const q = (request.query ?? {}) as {
        limit?: string;
        actorId?: string;
        action?: string;
        from?: string;
        to?: string;
      };

      const where: any = {};
      if (q.actorId) where.actorId = q.actorId;
      if (q.action) where.action = q.action;
      if (q.from || q.to) {
        where.createdAt = {};
        if (q.from) where.createdAt.gte = new Date(q.from);
        if (q.to) where.createdAt.lte = new Date(q.to);
      }

      const items = await prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseLimit(q.limit),
      });

      return { items };
    },
  );

  /** 前端导出等操作记审计（需对应权限） */
  fastify.post(
    '/admin/audit-events',
    { preHandler: fastify.requireRole('admin') },
    async (request, reply) => {
      const payload = await request.jwtVerify<{
        sub: string;
        email: string;
        role: 'user' | 'admin';
        permissions?: string[];
      }>();
      const perms = payload.permissions ?? ADMIN_PERMISSIONS;
      const body = request.body as {
        action?: string;
        summary?: string;
        meta?: unknown;
        targetType?: string;
        targetId?: string;
      };
      const action = String(body?.action ?? '').trim();
      if (!action) {
        return reply.code(400).send({ message: 'action required' });
      }

      if (action === 'analytics.export' && !perms.includes('analytics:export')) {
        return reply.code(403).send({ message: 'Forbidden' });
      }
      if (
        action === 'audit.export' &&
        (!perms.includes('audit:read') || !perms.includes('analytics:export'))
      ) {
        return reply.code(403).send({ message: 'Forbidden' });
      }

      await writeAuditLog({
        actorId: payload.sub,
        actorEmail: payload.email,
        action,
        targetType: body?.targetType,
        targetId: body?.targetId,
        summary: body?.summary,
        meta: body?.meta,
        request,
      });

      return { ok: true };
    },
  );
}

