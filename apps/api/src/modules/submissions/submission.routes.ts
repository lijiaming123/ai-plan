import type { FastifyInstance } from 'fastify';
import { createSubmission } from './submission.service';

export async function registerSubmissionRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/tasks/:taskId/submissions',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const params = request.params as { taskId?: string } | undefined;
      const body = request.body as
        | {
            content?: string;
            imageUrls?: string[];
          }
        | undefined;
      const payload = await request.jwtVerify<{ sub: string }>();
      const content = body?.content?.trim() ?? '';
      const imageUrls = Array.isArray(body?.imageUrls)
        ? body.imageUrls.filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
        : [];

      if (!content) {
        return reply.code(400).send({ message: 'Content is required' });
      }

      if (imageUrls.length === 0) {
        return reply.code(400).send({ message: 'At least one image is required' });
      }

      const submission = await createSubmission({
        taskId: params?.taskId ?? '',
        userId: payload.sub,
        content,
        imageUrls,
      });

      return reply.code(201).send(submission);
    }
  );
}
