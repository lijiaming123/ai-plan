/**
 * 补充 FastifyInstance 类型，使 TypeScript 识别 `fastify.requireRole`。
 * 运行时由 `plugins/auth.ts` 的 `fastify.decorate` 注入，需与此声明同步。
 */
import 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    requireRole: (role: 'user' | 'admin') => any;
  }
}
