import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';

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
}

