/**
 * 管理端只读 API（前缀 `/admin/*`，全部 `requireRole('admin')`）。
 *
 * 与 `auth.routes` 里 `/admin/secret` 不同：本文件承载业务数据；前者仅用于验证 admin token 是否有效。
 * 未做分页/游标：列表类接口固定 take N，生产可接 cursor + 索引优化。
 */
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';
import { aggregateTelemetryForUtcDay } from '../telemetry/telemetry-daily-agg.service';
import { getAdminUserDetail, listAdminUsers } from './admin-users.service';

export async function registerAdminRoutes(fastify: FastifyInstance) {
  /** 自动评判等功能的规则阈值配置（键值对），供后台页展示或编辑（当前路由只读） */
  fastify.get('/admin/rules', { preHandler: fastify.requirePermission('analytics:read') }, async () => {
    return prisma.ruleConfig.findMany({ orderBy: { key: 'asc' } });
  });

  /** 聚合：计划数、提交总数、规则条数、已完成/待重提交流、最近 5 条提交摘要 */
  fastify.get('/admin/dashboard', { preHandler: fastify.requirePermission('analytics:read') }, async () => {
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
  fastify.get('/admin/submissions', { preHandler: fastify.requirePermission('analytics:read') }, async () => {
    return prisma.taskSubmission.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        images: true,
      },
    });
  });

  /** 业务用户 ID 列表（来自计划/提交/Telemetry 并集），支持按 userId 片段搜索与分页 */
  fastify.get('/admin/users', { preHandler: fastify.requirePermission('users:read') }, async (request) => {
    const q = request.query as { q?: string; page?: string; pageSize?: string };
    const pageRaw = q.page != null ? parseInt(String(q.page), 10) : 1;
    const psRaw = q.pageSize != null ? parseInt(String(q.pageSize), 10) : 20;
    const page = Number.isFinite(pageRaw) ? pageRaw : 1;
    const pageSize = Number.isFinite(psRaw) ? psRaw : 20;
    return listAdminUsers({ search: q.q, page, pageSize });
  });

  fastify.get('/admin/users/:userId', { preHandler: fastify.requirePermission('users:read') }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const detail = await getAdminUserDetail(userId);
    if (!detail) {
      return reply.code(404).send({ message: 'User not found' });
    }
    return detail;
  });

  /** 按 UTC 日重算 Telemetry 日聚合（幂等） */
  fastify.post(
    '/admin/telemetry/aggregate-day',
    { preHandler: fastify.requirePermission('analytics:read') },
    async (request, reply) => {
      const q = request.query as { day?: string };
      const day = q.day?.trim();
      if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        return reply.code(400).send({ message: 'day must be YYYY-MM-DD (UTC)' });
      }
      try {
        const result = await aggregateTelemetryForUtcDay(day);
        return reply.send(result);
      } catch {
        return reply.code(400).send({ message: 'invalid day' });
      }
    },
  );
}
