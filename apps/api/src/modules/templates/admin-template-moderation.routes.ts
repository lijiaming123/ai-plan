import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';

export async function registerAdminTemplateModerationRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/admin/templates/:id/moderate',
    { preHandler: fastify.requirePermission('templates:moderate') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { action?: string; note?: string } | undefined;
      const payload = await request.jwtVerify<{ sub: string }>();
      const action = String(body?.action ?? '').trim();
      const note = body?.note != null ? String(body.note).trim() : '';

      const tpl = await prisma.marketTemplate.findUnique({ where: { id } });
      if (!tpl) return reply.code(404).send({ message: 'template not found' });

      if (action === 'unpublish') {
        const updated = await prisma.marketTemplate.update({
          where: { id },
          data: { status: 'unpublished', publishedAt: null },
          select: { id: true, status: true },
        });

        // 将关联 open 举报标记为 resolved（最小闭环）
        await prisma.templateReport.updateMany({
          where: { templateId: id, status: 'open' },
          data: {
            status: 'resolved',
            resolvedAt: new Date(),
            resolvedBy: payload.sub,
            resolution: note || 'unpublish',
          },
        });

        return reply.send({ ok: true, template: updated });
      }

      if (action === 'ban') {
        const updated = await prisma.marketTemplate.update({
          where: { id },
          data: { status: 'banned', publishedAt: null },
          select: { id: true, status: true },
        });
        await prisma.templateReport.updateMany({
          where: { templateId: id, status: 'open' },
          data: {
            status: 'resolved',
            resolvedAt: new Date(),
            resolvedBy: payload.sub,
            resolution: note || 'ban',
          },
        });
        return reply.send({ ok: true, template: updated });
      }

      return reply.code(400).send({ message: 'unsupported action' });
    },
  );
}

