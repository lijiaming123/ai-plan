import fastify from 'fastify';
import jwt from '@fastify/jwt';
import { authPlugin } from './plugins/auth';
import { registerAuthRoutes } from './modules/auth/auth.routes';
import { registerPlanRoutes } from './modules/plans/plan.routes';

export function buildApp() {
  const app = fastify({ logger: false });

  app.register(async (fastify) => {
    fastify.register(jwt, {
      secret: process.env.JWT_SECRET ?? 'dev-secret',
    });
    await authPlugin(fastify);
    await registerAuthRoutes(fastify);
    await registerPlanRoutes(fastify);
  });

  return app;
}
