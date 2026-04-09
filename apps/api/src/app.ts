import fastify from 'fastify';
import jwt from '@fastify/jwt';
import cors from '@fastify/cors';
import { authPlugin } from './plugins/auth';
import { registerAuthRoutes } from './modules/auth/auth.routes';
import { registerAdminRoutes } from './modules/admin/admin.routes';
import { registerPlanRoutes } from './modules/plans/plan.routes';
import { registerSubmissionRoutes } from './modules/submissions/submission.routes';

export function buildApp() {
  const app = fastify({ logger: false });

  app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: '*',
    strictPreflight: false,
  });

  app.register(async (fastify) => {
    fastify.register(jwt, {
      secret: process.env.JWT_SECRET ?? 'dev-secret',
    });
    await authPlugin(fastify);
    await registerAuthRoutes(fastify);
    await registerAdminRoutes(fastify);
    await registerPlanRoutes(fastify);
    await registerSubmissionRoutes(fastify);
  });

  return app;
}
