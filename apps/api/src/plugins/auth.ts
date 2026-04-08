import type { FastifyReply, FastifyRequest, FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    requireRole: (role: 'user' | 'admin') => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function authPlugin(fastify: FastifyInstance) {
  fastify.decorate('requireRole', (role: 'user' | 'admin') => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = await request.jwtVerify<{ role: 'user' | 'admin' }>();
      if (payload.role !== role) {
        return reply.code(403).send({ message: 'Forbidden' });
      }
    };
  });
}
