import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';

export async function registerAdminTemplateReviewRoutes(fastify: FastifyInstance) {
  function stableStringify(value: unknown): string {
    const seen = new WeakSet<object>();
    const normalize = (v: unknown): unknown => {
      if (v === null) return null;
      const t = typeof v;
      if (t === 'string' || t === 'number' || t === 'boolean') return v;
      if (Array.isArray(v)) return v.map(normalize);
      if (t === 'object') {
        const obj = v as Record<string, unknown>;
        if (seen.has(obj)) return '[Circular]';
        seen.add(obj);
        const keys = Object.keys(obj).sort();
        const out: Record<string, unknown> = {};
        for (const k of keys) out[k] = normalize(obj[k]);
        return out;
      }
      return String(v);
    };
    return JSON.stringify(normalize(value));
  }

  function payloadHash(payload: unknown): string {
    // 轻量哈希：用于去重与审计；不要求密码学强度
    let h = 2166136261;
    const s = stableStringify(payload);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`;
  }

  fastify.get(
    '/admin/templates/review-queue',
    { preHandler: fastify.requirePermission('templates:review') },
    async (request) => {
      const q = request.query as { page?: string; pageSize?: string; status?: string };
      const pageRaw = q.page != null ? parseInt(String(q.page), 10) : 1;
      const psRaw = q.pageSize != null ? parseInt(String(q.pageSize), 10) : 20;
      const page = Number.isFinite(pageRaw) ? pageRaw : 1;
      const pageSize = Number.isFinite(psRaw) ? psRaw : 20;
      const status = (q.status?.trim() || 'pending_review') as string;

      const items = await prisma.marketTemplate.findMany({
        where: { status },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          authorId: true,
          title: true,
          summary: true,
          category: true,
          tags: true,
          status: true,
          createdAt: true,
          publishedAt: true,
        },
      });

      return { items, page, pageSize };
    },
  );

  fastify.post(
    '/admin/templates/:id/approve',
    { preHandler: fastify.requirePermission('templates:review') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const payload = await request.jwtVerify<{ sub: string }>();
      const now = new Date();

      const row = await prisma.marketTemplate.findUnique({ where: { id } });
      if (!row) return reply.code(404).send({ message: 'template not found' });

      const updated = await prisma.$transaction(async (tx) => {
        const publishedAt = row.publishedAt ?? now;

        const versionCount = await tx.marketTemplateVersion.count({
          where: { templateId: id },
        });
        const nextVersion = versionCount + 1;
        const createdVersion = await tx.marketTemplateVersion.create({
          data: {
            templateId: id,
            version: nextVersion,
            payload: row.payload,
            payloadHash: payloadHash(row.payload),
          },
          select: { id: true },
        });

        return tx.marketTemplate.update({
          where: { id },
          data: {
            status: 'published',
            publishedAt,
            rejectedAt: null,
            rejectReasonCode: null,
            rejectNote: null,
            currentPublishedVersionId: createdVersion.id,
          },
          select: { id: true, status: true, publishedAt: true, currentPublishedVersionId: true },
        });
      });

      await prisma.templateReviewLog.create({
        data: {
          templateId: id,
          reviewerId: payload.sub,
          decision: 'approve',
        },
      });

      return reply.send({ ok: true, template: updated });
    },
  );

  fastify.post(
    '/admin/templates/:id/reject',
    { preHandler: fastify.requirePermission('templates:review') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { reasonCode?: string; note?: string } | undefined;
      const payload = await request.jwtVerify<{ sub: string }>();
      const now = new Date();

      const row = await prisma.marketTemplate.findUnique({ where: { id } });
      if (!row) return reply.code(404).send({ message: 'template not found' });

      const updated = await prisma.marketTemplate.update({
        where: { id },
        data: {
          status: 'rejected',
          rejectedAt: now,
          rejectReasonCode: body?.reasonCode?.trim() || null,
          rejectNote: body?.note?.trim() || null,
        },
        select: { id: true, status: true, rejectedAt: true, rejectReasonCode: true },
      });

      await prisma.templateReviewLog.create({
        data: {
          templateId: id,
          reviewerId: payload.sub,
          decision: 'reject',
          reasonCode: body?.reasonCode?.trim() || null,
          note: body?.note?.trim() || null,
        },
      });

      return reply.send({ ok: true, template: updated });
    },
  );
}

