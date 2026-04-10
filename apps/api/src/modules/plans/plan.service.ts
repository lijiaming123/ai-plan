import { prisma } from '../../lib/prisma';
import { generatePlanDraft, type GeneratePlanInput } from '@ai-plan/ai-engine/client';
import { resolveGranularityPlan, type GranularityMode, type SlotType } from './granularity';

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
  timeSlotType?: SlotType;
  timeSlotKey?: string;
  taskType?: 'action' | 'weekly_summary' | 'monthly_summary';
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
  granularityMode?: GranularityMode;
  stages: DraftStage[];
  createdAt: string;
};

type DraftState = {
  planId: string;
  versions: PlanVersionSnapshot[];
  maxVersions: number;
  confirmedVersion: number | null;
};

function toDateOnly(input: string) {
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function daysBetweenInclusive(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  return Math.max(1, days + 1);
}

function formatDayKey(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildTaskKeys(params: { slotType: SlotType; taskCount: number; startDate: Date }) {
  const keys: string[] = [];
  for (let i = 0; i < params.taskCount; i += 1) {
    if (params.slotType === 'day') {
      const next = new Date(params.startDate);
      next.setDate(params.startDate.getDate() + i);
      keys.push(formatDayKey(next));
      continue;
    }
    if (params.slotType === 'week') {
      keys.push(`W${i + 1}`);
      continue;
    }
    keys.push(`M${i + 1}`);
  }
  return keys;
}

function withTimeSlots(
  stages: Array<{ name: string; sortOrder: number; tasks: Array<{ id: string; title: string; order: number }> }>,
  options: { granularityMode: GranularityMode; startDateIso: string; deadlineIso: string }
) {
  const startDate = toDateOnly(options.startDateIso);
  const deadline = toDateOnly(options.deadlineIso);
  const durationDays = daysBetweenInclusive(startDate, deadline);
  const rule = resolveGranularityPlan({ mode: options.granularityMode, durationDays });
  const slotType = rule.slots[0] ?? 'day';

  return stages.map((stage) => {
    const keys = buildTaskKeys({ slotType, taskCount: stage.tasks.length, startDate });
    const taskList: DraftTask[] = stage.tasks.map((task, index) => ({
      ...task,
      timeSlotType: slotType,
      timeSlotKey: keys[index] ?? keys[keys.length - 1] ?? formatDayKey(startDate),
      taskType: 'action',
    }));

    if (rule.summaries.includes('weekly')) {
      taskList.push({
        id: `weekly-summary-${stage.sortOrder}`,
        title: '本周总结与复盘',
        order: taskList.length + 1,
        timeSlotType: 'week',
        timeSlotKey: `W${Math.max(1, Math.ceil(durationDays / 7))}`,
        taskType: 'weekly_summary',
      });
    }
    if (rule.summaries.includes('monthly')) {
      taskList.push({
        id: `monthly-summary-${stage.sortOrder}`,
        title: '本月总结与复盘',
        order: taskList.length + 1,
        timeSlotType: 'month',
        timeSlotKey: `M${Math.max(1, Math.ceil(durationDays / 30))}`,
        taskType: 'monthly_summary',
      });
    }

    return {
      ...stage,
      tasks: taskList,
    };
  });
}

function buildSnapshot(
  input: GeneratePlanInput,
  version: number,
  options?: { granularityMode?: GranularityMode; startDateIso?: string }
): PlanVersionSnapshot {
  const draft = generatePlanDraft(input);
  const granularityMode = options?.granularityMode ?? 'smart';
  const slottedStages = withTimeSlots(draft.stages, {
    granularityMode,
    startDateIso: options?.startDateIso ?? input.deadline,
    deadlineIso: input.deadline,
  });
  return {
    version,
    requirement: input.requirement,
    deadline: input.deadline,
    granularityMode,
    stages: slottedStages,
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
  const stages = (Array.isArray(version.snapshot) ? version.snapshot : []) as DraftStage[];
  const allTasks = stages.flatMap((stage) => stage.tasks);
  const granularityMode: GranularityMode | undefined = allTasks.some(
    (task) => task.taskType === 'weekly_summary' || task.taskType === 'monthly_summary'
  )
    ? 'deep'
    : allTasks.some((task) => task.timeSlotType === 'week')
      ? 'rough'
      : undefined;
  return {
    version: version.version,
    requirement: version.requirement,
    deadline: version.deadline.toISOString(),
    granularityMode,
    stages,
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

export async function getPlanDraft(planId: string, userId: string) {
  const plan = await prisma.plan.findFirst({
    where: { id: planId, userId },
  });
  if (!plan) return { ok: false as const, code: 404 as const, message: 'plan not found' };
  if (plan.status === 'active') {
    return { ok: false as const, code: 409 as const, message: 'draft is closed' };
  }
  const state = await loadDraftState(plan);
  return {
    ok: true as const,
    draft: {
      versions: state.versions,
      maxVersions: state.maxVersions,
      confirmedVersion: state.confirmedVersion,
      canRegenerate: state.versions.length < state.maxVersions && state.confirmedVersion === null,
    },
  };
}

export async function regeneratePlanVersion(
  planId: string,
  userId: string,
  requirement?: string,
  granularityMode?: GranularityMode
) {
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
  const effectiveGranularityMode = granularityMode ?? state.versions[state.versions.length - 1]?.granularityMode ?? 'smart';
  const nextSnapshot = buildSnapshot(
    {
      goal: plan.goal,
      deadline: plan.deadline.toISOString(),
      requirement: requirement?.trim() ? requirement : plan.requirement,
      type: plan.type as GeneratePlanInput['type'],
    },
    nextVersion,
    {
      granularityMode: effectiveGranularityMode,
      startDateIso: plan.deadline.toISOString(),
    }
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

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.plan.update({
      where: { id: planId },
      data: {
        status: 'active',
        currentVersion: version,
        confirmedVersion: version,
        requirement: snapshot.requirement,
        deadline: new Date(snapshot.deadline),
      },
    });
    await tx.planVersion.deleteMany({
      where: { planId, version: { not: version } },
    });
    return next;
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

export async function createGeneratedPlan(
  input: GeneratePlanInput & {
    userId: string;
    granularityMode?: GranularityMode;
    startDateIso?: string;
  }
) {
  const snapshot = buildSnapshot(input, 1, {
    granularityMode: input.granularityMode,
    startDateIso: input.startDateIso ?? input.deadline,
  });

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
      snapshot.stages.map((stage) =>
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
        snapshot: snapshot.stages,
      },
    });

    const response = {
      ...createdPlan,
      stages: createdStages.map((stage, index) => ({
        id: stage.id,
        name: stage.name,
        sortOrder: stage.sortOrder,
        tasks: snapshot.stages[index]?.tasks ?? [],
      })),
    };
    const state: DraftState = {
      planId: createdPlan.id,
      versions: [snapshot],
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
