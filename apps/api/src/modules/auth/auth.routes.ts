import type { FastifyInstance } from 'fastify';
import { authenticateUser } from './auth.service';

export async function registerAuthRoutes(fastify: FastifyInstance) {
  fastify.post('/auth/login', async (request, reply) => {
    const body = request.body as { email?: string; password?: string } | undefined;
    const user = await authenticateUser({
      email: body?.email ?? '',
      password: body?.password ?? '',
    });

    if (!user) {
      return reply.code(401).send({ message: 'Invalid credentials' });
    }

    return {
      token: fastify.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
      }),
    };
  });

  fastify.get('/auth/me', { preHandler: fastify.requireRole('user') }, async (request) => {
    const payload = await request.jwtVerify<{ sub: string; email: string; role: 'user' | 'admin' }>();
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  });

  fastify.get('/admin/secret', { preHandler: fastify.requireRole('admin') }, async () => {
    return { ok: true };
  });
}
