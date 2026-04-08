import type { FastifyInstance } from 'fastify';
import { createGeneratedPlan, sanitizePlanPatch } from './plan.service';

export async function registerPlanRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/plans',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const body = request.body as
        | {
            goal?: string;
            deadline?: string;
            requirement?: string;
            type?: 'general' | 'study' | 'work';
          }
        | undefined;
      const payload = await request.jwtVerify<{ sub: string }>();
      const plan = await createGeneratedPlan({
        userId: payload.sub,
        goal: body?.goal ?? '',
        deadline: body?.deadline ?? new Date().toISOString(),
        requirement: body?.requirement ?? '',
        type: body?.type ?? 'general',
      });

      return reply.code(201).send(plan);
    }
  );

  fastify.patch(
    '/plans/:id',
    { preHandler: fastify.requireRole('user') },
    async (request) => {
      const body = request.body as Record<string, unknown> | undefined;
      return sanitizePlanPatch(body ?? {});
    }
  );
}
