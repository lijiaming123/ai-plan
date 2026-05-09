import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';

const patchMarketTemplateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  summary: z.string().min(1).max(5000).optional(),
  category: z.string().min(1).max(120).optional(),
  tags: z.array(z.string().max(64)).max(32).optional(),
});

export async function registerTemplateAuthorRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/templates/market/:id/unpublish',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const payload = await request.jwtVerify<{ sub: string }>();

      const tpl = await prisma.marketTemplate.findUnique({ where: { id } });
      if (!tpl || tpl.authorId !== payload.sub) {
        return reply.code(404).send({ message: 'template not found' });
      }

      const updated = await prisma.marketTemplate.update({
        where: { id },
        data: {
          status: 'unpublished',
          publishedAt: null,
        },
        select: { id: true, status: true },
      });

      return reply.send({ ok: true, template: updated });
    },
  );

  fastify.patch(
    '/templates/market/:id',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const payload = await request.jwtVerify<{ sub: string }>();

      const parsed = patchMarketTemplateSchema.safeParse(request.body);
      if (!parsed.success) {
        const first = parsed.error.issues?.[0];
        return reply.code(400).send({ message: first?.message ?? '请求参数有误' });
      }

      const tpl = await prisma.marketTemplate.findUnique({ where: { id } });
      if (!tpl || tpl.authorId !== payload.sub) {
        return reply.code(404).send({ message: 'template not found' });
      }

      const updated = await prisma.marketTemplate.update({
        where: { id },
        data: {
          ...parsed.data,
          status: 'pending_review',
          publishedAt: null,
          rejectedAt: null,
          rejectReasonCode: null,
          rejectNote: null,
        },
        select: { id: true, status: true },
      });

      return reply.send({ ok: true, template: updated });
    },
  );
}

