import 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    requireRole: (role: 'user' | 'admin') => any;
  }
}
