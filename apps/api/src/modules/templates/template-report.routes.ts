import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';

export async function registerTemplateReportRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/templates/market/:id/report',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const payload = await request.jwtVerify<{ sub: string }>();
      const body = request.body as { reasonCode?: string; description?: string } | undefined;

      const reasonCode = String(body?.reasonCode ?? '').trim();
      const description = String(body?.description ?? '').trim();
      if (!reasonCode) return reply.code(400).send({ message: 'reasonCode required' });
      if (!description) return reply.code(400).send({ message: 'description required' });
      if (description.length > 2000) return reply.code(400).send({ message: 'description too long' });

      const tpl = await prisma.marketTemplate.findFirst({
        where: { id, status: 'published' },
        select: { id: true },
      });
      if (!tpl) return reply.code(404).send({ message: 'template not found' });

      const created = await prisma.templateReport.create({
        data: {
          templateId: id,
          reporterId: payload.sub,
          reasonCode,
          description,
        },
        select: { id: true },
      });

      return reply.code(201).send(created);
    },
  );
}

