import { prisma } from '../../lib/prisma';

export type CreatePlanInput = {
  userId: string;
  goal: string;
  deadline: Date;
  requirement: string;
  type: string;
};

export async function createPlanRecord(input: CreatePlanInput) {
  return prisma.plan.create({
    data: {
      userId: input.userId,
      goal: input.goal,
      deadline: input.deadline,
      requirement: input.requirement,
      type: input.type,
    },
  });
}
