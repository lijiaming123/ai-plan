/**
 * Plan 表的最小数据访问层（历史/兼容路径）。
 *
 * 当前主流程创建计划请走 `plan.service` 的 `createGeneratedPlan`（同事务写 Plan + Stage + Version）。
 * 本模块保留给旧调用方或测试直接插入 Plan 行时使用。
 */
import { prisma } from '../../lib/prisma';

export type CreatePlanInput = {
  userId: string;
  goal: string;
  deadline: Date;
  requirement: string;
  type: string;
};

/** 仅 create Plan，不写 PlanVersion（草稿树不完整，慎用） */
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
