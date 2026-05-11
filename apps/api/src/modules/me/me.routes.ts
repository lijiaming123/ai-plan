/**
 * 用户域下与「当前登录用户」相关的路由（非 /auth/*）。
 */
import type { FastifyInstance } from 'fastify';
import { getPlanHeatmapForUser, parseHeatmapYear } from './plan-heatmap.service';
import { getUserInsights } from './user-insights.service';
import {
  appendPinnedNote,
  getPlanAssistantContextForApi,
  patchPlanAssistantProfile,
  validatePlanAssistantProfilePatch,
} from './plan-assistant-context.service';

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

  /** 计划助手：结构化偏好 + 非 RAG 完成度摘要（仅 App 用户） */
  fastify.get(
    '/me/plan-assistant-context',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      const ctx = await getPlanAssistantContextForApi(payload.sub);
      if (!ctx) {
        return reply.code(404).send({ message: '仅注册用户可使用计划助手记忆' });
      }
      return ctx;
    },
  );

  fastify.patch(
    '/me/plan-assistant-profile',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      const parsed = validatePlanAssistantProfilePatch(request.body);
      if (!parsed.ok) {
        return reply.code(400).send({ message: parsed.message });
      }
      const res = await patchPlanAssistantProfile(payload.sub, parsed.data);
      if (!res.ok) {
        return reply.code(404).send({ message: res.message });
      }
      const ctx = await getPlanAssistantContextForApi(payload.sub);
      return ctx ?? { ok: true };
    },
  );

  fastify.post(
    '/me/plan-assistant-profile/pin-note',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      const body = request.body as { text?: unknown };
      const text = typeof body?.text === 'string' ? body.text : '';
      const res = await appendPinnedNote(payload.sub, text);
      if (!res.ok) {
        return reply.code(400).send({ message: res.message });
      }
      const ctx = await getPlanAssistantContextForApi(payload.sub);
      return ctx ?? { ok: true };
    },
  );
}
