/**
 * 管理端只读 API（前缀 `/admin/*`，全部 `requireRole('admin')`）。
 *
 * 与 `auth.routes` 里 `/admin/secret` 不同：本文件承载业务数据；前者仅用于验证 admin token 是否有效。
 * 未做分页/游标：列表类接口固定 take N，生产可接 cursor + 索引优化。
 */
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';

export async function registerAdminRoutes(fastify: FastifyInstance) {
  /** 自动评判等功能的规则阈值配置（键值对），供后台页展示或编辑（当前路由只读） */
  fastify.get('/admin/rules', { preHandler: fastify.requireRole('admin') }, async () => {
    return prisma.ruleConfig.findMany({ orderBy: { key: 'asc' } });
  });

  /** 聚合：计划数、提交总数、规则条数、已完成/待重提交流、最近 5 条提交摘要 */
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

  /** 最近 20 条提交，含图片关联行（体积可能较大，仅管理端使用） */
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
