/**
 * 任务提交持久化。
 *
 * 单事务写入父记录 + `createMany` 子表图片；每条图片存原始 url 与 sha256(url)，便于去重或审计。
 * 初始 status=`in_review`，供 evaluation.service 异步或同步改为 completed / needs_retry。
 */
import { prisma } from '../../lib/prisma';
import { hashUrl } from '../storage/storage.service';

export type CreateSubmissionInput = {
  taskId: string;
  userId: string;
  content: string;
  imageUrls: string[];
};

/** @returns 含 images 关联的完整提交记录（与 Prisma schema 一致） */
export async function createSubmission(input: CreateSubmissionInput) {
  return prisma.taskSubmission.create({
    data: {
      taskId: input.taskId,
      userId: input.userId,
      content: input.content,
      status: 'in_review',
      images: {
        createMany: {
          data: input.imageUrls.map((url) => ({ url, hash: hashUrl(url) })),
        },
      },
    },
    include: { images: true },
  });
}
