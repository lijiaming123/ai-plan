/**
 * Fastify 应用工厂（无副作用监听，便于测试里 `buildApp()` 后注入依赖或 `inject`）。
 *
 * 注册顺序说明：
 * - CORS：`origin: true` 反射请求来源，适合浏览器直连 API；生产可收紧为白名单。
 * - 内层闭包：先挂 @fastify/jwt（密钥 JWT_SECRET），再 `authPlugin` 装饰 `requireRole`，
 *   后续各路由通过 `preHandler: fastify.requireRole('user'|'admin')` 统一鉴权。
 * - 路由模块彼此独立，可按需调整 register 顺序（除 auth 需先于依赖 JWT 的路由外无硬依赖）。
 */
import fastify from 'fastify';
import jwt from '@fastify/jwt';
import cors from '@fastify/cors';
import { authPlugin } from './plugins/auth';
import { registerAuthRoutes } from './modules/auth/auth.routes';
import { registerMeRoutes } from './modules/me/me.routes';
import { registerAdminRoutes } from './modules/admin/admin.routes';
import { registerAuditLogRoutes } from './modules/admin/audit-log.routes';
import { registerPlanRoutes } from './modules/plans/plan.routes';
import { registerSubmissionRoutes } from './modules/submissions/submission.routes';
import { registerTemplateRoutes } from './modules/templates/template.routes';
import { registerNotificationRoutes } from './modules/notifications/notification.routes';
import multipart from '@fastify/multipart';
import { registerUploadRoutes } from './modules/uploads/upload.routes';
import { registerTelemetryRoutes } from './modules/telemetry/telemetry.routes';

export function buildApp() {
  // logger: false 减少默认控制台噪音；需要排障时可改为 true 或接 pino 目标
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
    await fastify.register(multipart, {
      limits: { fileSize: 15 * 1024 * 1024, files: 1 },
    });
    await registerUploadRoutes(fastify);
    await registerAuthRoutes(fastify);
    await registerMeRoutes(fastify);
    await registerAdminRoutes(fastify);
    await registerAuditLogRoutes(fastify);
    await registerPlanRoutes(fastify);
    await registerSubmissionRoutes(fastify);
    await registerTemplateRoutes(fastify);
    await registerNotificationRoutes(fastify);
    await registerTelemetryRoutes(fastify);
  });

  return app;
}
