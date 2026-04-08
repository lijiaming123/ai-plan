import { prisma } from '../../lib/prisma';
import { generatePlanDraft, type GeneratePlanInput } from '../../../../../packages/ai-engine/src/client';

const editableFields = ['deadline', 'note'] as const;

export function sanitizePlanPatch(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) =>
      editableFields.includes(key as (typeof editableFields)[number])
    )
  );
}

function buildFallbackPlan(input: GeneratePlanInput & { userId: string }) {
  const draft = generatePlanDraft(input);
  return {
    id: `plan_${Date.now()}`,
    userId: input.userId,
    goal: input.goal,
    deadline: new Date(input.deadline),
    requirement: input.requirement,
    type: input.type,
    status: 'active',
    createdAt: new Date(),
    stages: draft.stages.map((stage) => ({
      id: `stage_${stage.sortOrder}`,
      name: stage.name,
      sortOrder: stage.sortOrder,
      tasks: stage.tasks,
    })),
  };
}

export async function createGeneratedPlan(input: GeneratePlanInput & { userId: string }) {
  const draft = generatePlanDraft(input);

  try {
    return await prisma.$transaction(async (tx) => {
      const createdPlan = await tx.plan.create({
        data: {
          userId: input.userId,
          goal: input.goal,
          deadline: new Date(input.deadline),
          requirement: input.requirement,
          type: input.type,
        },
      });

      const createdStages = await Promise.all(
        draft.stages.map((stage) =>
          tx.planStage.create({
            data: {
              planId: createdPlan.id,
              name: stage.name,
              sortOrder: stage.sortOrder,
            },
          })
        )
      );

      return {
        ...createdPlan,
        stages: createdStages.map((stage, index) => ({
          id: stage.id,
          name: stage.name,
          sortOrder: stage.sortOrder,
          tasks: draft.stages[index]?.tasks ?? [],
        })),
      };
    });
  } catch {
    return buildFallbackPlan(input);
  }
}
