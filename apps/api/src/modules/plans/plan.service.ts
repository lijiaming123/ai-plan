import { prisma } from '../../lib/prisma';
import { generatePlanDraft, type GeneratePlanInput } from '@ai-plan/ai-engine/client';

const editableFields = ['deadline', 'note'] as const;

export function sanitizePlanPatch(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) =>
      editableFields.includes(key as (typeof editableFields)[number])
    )
  );
}

type DraftTask = {
  id: string;
  title: string;
  order: number;
};

type DraftStage = {
  name: string;
  sortOrder: number;
  tasks: DraftTask[];
};

export type PlanVersionSnapshot = {
  version: number;
  requirement: string;
  deadline: string;
  stages: DraftStage[];
  createdAt: string;
};

type DraftState = {
  planId: string;
  versions: PlanVersionSnapshot[];
  maxVersions: number;
  confirmedVersion: number | null;
};

function buildSnapshot(input: GeneratePlanInput, version: number): PlanVersionSnapshot {
  const draft = generatePlanDraft(input);
  return {
    version,
    requirement: input.requirement,
    deadline: input.deadline,
    stages: draft.stages,
    createdAt: new Date().toISOString(),
  };
}

const MAX_VERSIONS = 3;

type PlanRow = {
  id: string;
  goal: string;
  deadline: Date;
  requirement: string;
  type: string;
  status: string;
  currentVersion: number;
  confirmedVersion: number | null;
};

async function ensureBaselineVersion(plan: PlanRow) {
  const firstVersion = await prisma.planVersion.findFirst({
    where: { planId: plan.id },
    orderBy: { version: 'asc' },
  });
  if (firstVersion) return;

  const snapshot = buildSnapshot(
    {
      goal: plan.goal,
      deadline: plan.deadline.toISOString(),
      requirement: plan.requirement,
      type: plan.type as GeneratePlanInput['type'],
    },
    1
  );

  await prisma.planVersion.create({
    data: {
      planId: plan.id,
      version: 1,
      requirement: snapshot.requirement,
      deadline: new Date(snapshot.deadline),
      snapshot: snapshot.stages,
    },
  });

  if (plan.currentVersion !== 1) {
    await prisma.plan.update({
      where: { id: plan.id },
      data: { currentVersion: 1 },
    });
  }
}

function toSnapshot(version: {
  version: number;
  requirement: string;
  deadline: Date;
  snapshot: unknown;
  createdAt: Date;
}): PlanVersionSnapshot {
  return {
    version: version.version,
    requirement: version.requirement,
    deadline: version.deadline.toISOString(),
    stages: (Array.isArray(version.snapshot) ? version.snapshot : []) as DraftStage[],
    createdAt: version.createdAt.toISOString(),
  };
}

async function loadDraftState(plan: PlanRow): Promise<DraftState> {
  await ensureBaselineVersion(plan);
  const versions = await prisma.planVersion.findMany({
    where: { planId: plan.id },
    orderBy: { version: 'asc' },
  });
  return {
    planId: plan.id,
    versions: versions.map((item) => toSnapshot(item)),
    maxVersions: MAX_VERSIONS,
    confirmedVersion: plan.confirmedVersion,
  };
}

export async function getDraftState(planId: string) {
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
  });
  if (!plan) return null;
  return await loadDraftState(plan);
}

export async function getPlanWithDraft(planId: string, userId: string) {
  const plan = await prisma.plan.findFirst({
    where: { id: planId, userId },
  });
  if (!plan) return null;
  const state = await loadDraftState(plan);
  return {
    ...plan,
    draft: {
      versions: state.versions,
      maxVersions: state.maxVersions,
      confirmedVersion: state.confirmedVersion,
      canRegenerate: state.versions.length < state.maxVersions && state.confirmedVersion === null,
    },
  };
}

export async function regeneratePlanVersion(planId: string, userId: string, requirement?: string) {
  const plan = await prisma.plan.findFirst({
    where: { id: planId, userId },
  });
  if (!plan) return { ok: false as const, code: 404 as const, message: 'plan not found' };

  const state = await loadDraftState(plan);
  if (state.confirmedVersion !== null) {
    return { ok: false as const, code: 409 as const, message: 'plan is already confirmed' };
  }
  if (state.versions.length >= state.maxVersions) {
    return { ok: false as const, code: 409 as const, message: 'version limit reached' };
  }

  const nextVersion = state.versions.length + 1;
  const nextSnapshot = buildSnapshot(
    {
      goal: plan.goal,
      deadline: plan.deadline.toISOString(),
      requirement: requirement?.trim() ? requirement : plan.requirement,
      type: plan.type as GeneratePlanInput['type'],
    },
    nextVersion
  );
  await prisma.planVersion.create({
    data: {
      planId,
      version: nextVersion,
      requirement: nextSnapshot.requirement,
      deadline: new Date(nextSnapshot.deadline),
      snapshot: nextSnapshot.stages,
    },
  });

  await prisma.plan.update({
    where: { id: planId },
    data: { currentVersion: nextVersion },
  });

  const refreshedPlan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });
  const refreshedState = await loadDraftState(refreshedPlan);
  return { ok: true as const, state: refreshedState };
}

export async function confirmPlanVersion(planId: string, userId: string, version: number) {
  const plan = await prisma.plan.findFirst({
    where: { id: planId, userId },
  });
  if (!plan) return { ok: false as const, code: 404 as const, message: 'plan not found' };

  const state = await loadDraftState(plan);
  const snapshot = state.versions.find((item) => item.version === version);
  if (!snapshot) return { ok: false as const, code: 404 as const, message: 'version not found' };

  const updated = await prisma.plan.update({
    where: { id: planId },
    data: {
      status: 'active',
      currentVersion: version,
      confirmedVersion: version,
      requirement: snapshot.requirement,
      deadline: new Date(snapshot.deadline),
    },
  });
  const refreshedState = await loadDraftState(updated);
  return { ok: true as const, state: refreshedState, plan: updated };
}

export async function compareDraftVersions(planId: string, baseVersion: number, targetVersion: number) {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) return null;
  const state = await loadDraftState(plan);
  const base = state.versions.find((item) => item.version === baseVersion);
  const target = state.versions.find((item) => item.version === targetVersion);
  if (!base || !target) return null;

  const baseStages = new Set(base.stages.map((stage) => stage.name));
  const targetStages = new Set(target.stages.map((stage) => stage.name));
  const addedStages = [...targetStages].filter((name) => !baseStages.has(name));
  const removedStages = [...baseStages].filter((name) => !targetStages.has(name));

  const baseTasks = new Set(base.stages.flatMap((stage) => stage.tasks.map((task) => `${stage.name}::${task.title}`)));
  const targetTasks = new Set(target.stages.flatMap((stage) => stage.tasks.map((task) => `${stage.name}::${task.title}`)));
  const addedTasks = [...targetTasks].filter((name) => !baseTasks.has(name));
  const removedTasks = [...baseTasks].filter((name) => !targetTasks.has(name));

  return {
    baseVersion,
    targetVersion,
    addedStages,
    removedStages,
    addedTasks,
    removedTasks,
  };
}

export async function createGeneratedPlan(input: GeneratePlanInput & { userId: string }) {
  const draft = generatePlanDraft(input);

  return prisma.$transaction(async (tx) => {
    const createdPlan = await tx.plan.create({
      data: {
        userId: input.userId,
        goal: input.goal,
        deadline: new Date(input.deadline),
        requirement: input.requirement,
        type: input.type,
        status: 'draft',
        currentVersion: 1,
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

    await tx.planVersion.create({
      data: {
        planId: createdPlan.id,
        version: 1,
        requirement: input.requirement,
        deadline: new Date(input.deadline),
        snapshot: draft.stages,
      },
    });

    const response = {
      ...createdPlan,
      stages: createdStages.map((stage, index) => ({
        id: stage.id,
        name: stage.name,
        sortOrder: stage.sortOrder,
        tasks: draft.stages[index]?.tasks ?? [],
      })),
    };
    const state: DraftState = {
      planId: createdPlan.id,
      versions: [buildSnapshot(input, 1)],
      maxVersions: MAX_VERSIONS,
      confirmedVersion: null,
    };
    return {
      ...response,
      draft: {
        versions: state.versions,
        maxVersions: state.maxVersions,
        confirmedVersion: state.confirmedVersion,
        canRegenerate: true,
      },
    };
  });
}
