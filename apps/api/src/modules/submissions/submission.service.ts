import { prisma } from '../../lib/prisma';
import { hashUrl } from '../storage/storage.service';

export type CreateSubmissionInput = {
  taskId: string;
  userId: string;
  content: string;
  imageUrls: string[];
};

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
