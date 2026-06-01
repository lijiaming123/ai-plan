import type { FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma';

export type AuditAction =
  | 'analytics.export'
  | 'analytics.drilldown'
  | 'rbac.change'
  | 'user.ban'
  | 'user.unban'
  | 'user.plan_tier'
  | 'admin.read';

export async function writeAuditLog(input: {
  actorId: string;
  actorEmail: string;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  summary?: string;
  meta?: unknown;
  request?: FastifyRequest;
}) {
  const ip = input.request?.ip;
  const userAgent = input.request?.headers['user-agent'];

  return prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      actorEmail: input.actorEmail,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      summary: input.summary,
      meta: input.meta as any,
      ip: typeof ip === 'string' ? ip : null,
      userAgent: typeof userAgent === 'string' ? userAgent : null,
    },
  });
}

