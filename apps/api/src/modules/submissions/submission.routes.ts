/**
 * 任务执行提交路由。
 *
 * POST /tasks/:taskId/submissions：登录用户（role=user）提交「文字说明 + 至少一张图片 URL」。
 * 不做任务归属强校验（taskId 是否存在、是否属于该用户）：由上层 BFF 或后续迭代在 service 中补全。
 * 成功 201，body 为 Prisma 创建的 TaskSubmission 及嵌套 images。
 */
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
