import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';

export async function registerAdminTemplateReportRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/admin/templates/reports',
    { preHandler: fastify.requirePermission('templates:review') },
    async (request) => {
      const q = request.query as { page?: string; pageSize?: string; status?: string };
      const pageRaw = q.page != null ? parseInt(String(q.page), 10) : 1;
      const psRaw = q.pageSize != null ? parseInt(String(q.pageSize), 10) : 20;
      const page = Number.isFinite(pageRaw) ? pageRaw : 1;
      const pageSize = Number.isFinite(psRaw) ? psRaw : 20;
      const status = (q.status?.trim() || 'open') as string;

      const items = await prisma.templateReport.findMany({
        where: { status },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          templateId: true,
          reporterId: true,
          reasonCode: true,
          description: true,
          status: true,
          createdAt: true,
        },
      });

      return { items, page, pageSize };
    },
  );
}

