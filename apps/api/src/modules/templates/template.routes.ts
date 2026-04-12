import type { FastifyInstance, FastifyRequest } from 'fastify';
import { applyPresetTemplate, listPresets } from './preset-template.service';
import {
  applyMarketTemplate,
  favoriteMarketTemplate,
  getMarketTemplatePublic,
  likeMarketTemplate,
  listMarketTemplates,
  listMyMarketTemplates,
  publishMarketTemplate,
  unfavoriteMarketTemplate,
  unlikeMarketTemplate,
} from './market-template.service';

async function optionalViewerUserId(request: FastifyRequest): Promise<string | undefined> {
  const auth = request.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return undefined;
  }
  try {
    const payload = await request.jwtVerify<{ sub: string }>();
    return payload.sub;
  } catch {
    return undefined;
  }
}

export async function registerTemplateRoutes(fastify: FastifyInstance) {
  fastify.get('/templates/presets', async (request, reply) => {
    const q = request.query as { category?: string };
    const items = await listPresets(q.category?.trim() || undefined);
    return reply.send({ items });
  });

  fastify.post(
    '/templates/presets/:id/apply',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const payload = await request.jwtVerify<{ sub: string }>();
      const result = await applyPresetTemplate(id, payload.sub);
      if (!result.ok) {
        return reply.code(result.code).send({ message: result.message });
      }
      return reply.code(201).send({ planId: result.planId });
    },
  );

  fastify.get('/templates/my/market', { preHandler: fastify.requireRole('user') }, async (request, reply) => {
    const payload = await request.jwtVerify<{ sub: string }>();
    const result = await listMyMarketTemplates(payload.sub, request.query as Record<string, unknown>);
    if (!result.ok) {
      return reply.code(400).send({ message: result.message });
    }
    return reply.send(result.data);
  });

  fastify.get('/templates/market', async (request, reply) => {
    const viewerUserId = await optionalViewerUserId(request);
    const result = await listMarketTemplates(request.query as Record<string, unknown>, {
      viewerUserId,
    });
    if (!result.ok) {
      return reply.code(400).send({ message: result.message });
    }
    return reply.send(result.data);
  });

  fastify.get('/templates/market/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await getMarketTemplatePublic(id);
    if (!row) {
      return reply.code(404).send({ message: 'template not found' });
    }
    return reply.send(row);
  });

  fastify.post(
    '/templates/market',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      const result = await publishMarketTemplate(request.body, payload.sub);
      if (!result.ok) {
        return reply.code(result.code).send({ message: result.message });
      }
      return reply.code(201).send(result.template);
    },
  );

  fastify.post(
    '/templates/market/:id/like',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const payload = await request.jwtVerify<{ sub: string }>();
      const result = await likeMarketTemplate(id, payload.sub);
      if (!result.ok) {
        return reply.code(result.code).send({ message: result.message });
      }
      return reply.send({ liked: result.liked, likeCount: result.likeCount });
    },
  );

  fastify.delete(
    '/templates/market/:id/like',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const payload = await request.jwtVerify<{ sub: string }>();
      const result = await unlikeMarketTemplate(id, payload.sub);
      if (!result.ok) {
        return reply.code(result.code).send({ message: result.message });
      }
      return reply.send({ liked: result.liked, likeCount: result.likeCount });
    },
  );

  fastify.post(
    '/templates/market/:id/favorite',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const payload = await request.jwtVerify<{ sub: string }>();
      const result = await favoriteMarketTemplate(id, payload.sub);
      if (!result.ok) {
        return reply.code(result.code).send({ message: result.message });
      }
      return reply.send({ favorited: result.favorited });
    },
  );

  fastify.delete(
    '/templates/market/:id/favorite',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const payload = await request.jwtVerify<{ sub: string }>();
      const result = await unfavoriteMarketTemplate(id, payload.sub);
      if (!result.ok) {
        return reply.code(result.code).send({ message: result.message });
      }
      return reply.send({ favorited: result.favorited });
    },
  );

  fastify.post(
    '/templates/market/:id/apply',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const payload = await request.jwtVerify<{ sub: string }>();
      const result = await applyMarketTemplate(id, payload.sub);
      if (!result.ok) {
        return reply.code(result.code).send({ message: result.message });
      }
      return reply.code(201).send({ planId: result.planId });
    },
  );
}
