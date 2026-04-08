import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';

export async function registerAdminRoutes(fastify: FastifyInstance) {
  fastify.get('/admin/rules', { preHandler: fastify.requireRole('admin') }, async () => {
    return prisma.ruleConfig.findMany({ orderBy: { key: 'asc' } });
  });

  fastify.get('/admin/dashboard', { preHandler: fastify.requireRole('admin') }, async () => {
    const [planCount, submissionCount, ruleCount, completedCount, retryCount, recentSubmissions] =
      await Promise.all([
        prisma.plan.count(),
        prisma.taskSubmission.count(),
        prisma.ruleConfig.count(),
        prisma.taskSubmission.count({ where: { status: 'completed' } }),
        prisma.taskSubmission.count({ where: { status: 'needs_retry' } }),
        prisma.taskSubmission.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            taskId: true,
            userId: true,
            status: true,
            createdAt: true,
            content: true,
          },
        }),
      ]);

    return {
      planCount,
      submissionCount,
      ruleCount,
      completedCount,
      retryCount,
      recentSubmissions,
    };
  });

  fastify.get('/admin/submissions', { preHandler: fastify.requireRole('admin') }, async () => {
    return prisma.taskSubmission.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        images: true,
      },
    });
  });
}
