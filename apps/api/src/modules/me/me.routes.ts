/**
 * 用户域下与「当前登录用户」相关的路由（非 /auth/*）。
 */
import type { FastifyInstance } from 'fastify';
import { getPlanHeatmapForUser, parseHeatmapYear } from './plan-heatmap.service';
import { getUserInsights } from './user-insights.service';

export async function registerMeRoutes(fastify: FastifyInstance) {
  fastify.get('/me/insights', { preHandler: fastify.requireRole('user') }, async (request) => {
    const payload = await request.jwtVerify<{ sub: string }>();
    return getUserInsights(payload.sub);
  });

  fastify.get('/me/plan-heatmap', { preHandler: fastify.requireRole('user') }, async (request, reply) => {
    const payload = await request.jwtVerify<{ sub: string }>();
    const q = request.query as { year?: string };
    const fallbackYear = new Date().getFullYear();
    const parsed = parseHeatmapYear(q.year, fallbackYear);
    if (!parsed.ok) {
      return reply.code(400).send({ message: 'Invalid year' });
    }

    return getPlanHeatmapForUser(payload.sub, parsed.year);
  });
}
