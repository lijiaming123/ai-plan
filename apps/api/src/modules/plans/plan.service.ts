/**
 * 计划核心业务（草稿 / 定稿 / 版本树）。
 *
 * 数据模型关系（简化）：
 * - Plan：用户一条计划主档（goal、deadline、requirement、status=draft|active 等）。
 * - PlanVersion：每个版本一条行，`snapshot` 存 JSON 阶段+任务（含 timeSlot*、taskType）。
 * - 最多 MAX_VERSIONS 个版本；confirmedVersion 非空表示已定稿，草稿接口返回 409。
 *
 * 生成管线：generatePlanDraft(ai-engine) → buildSnapshot → withTimeSlots(granularity) 写入快照。
 * 对外导出函数见各 export 上方注释；本文件中部多为纯函数与 Prisma 事务。
 */
import { prisma } from '../../lib/prisma';
import { generatePlanDraft, type GeneratePlanInput } from '@ai-plan/ai-engine/client';
import { resolveGranularityPlan, type GranularityMode, type SlotType } from './granularity';
import {
  buildFallbackSchedule,
  extractLastJsonCodeBlock,
  parseScheduleWireOrNull,
  stripLastJsonCodeBlock,
  validateScheduleStrict,
  type CheckinSchedule,
} from './deepseek-schedule';

const editableFields = ['deadline', 'note'] as const;

export type ScheduleGranularity = 'day' | 'week';

/** PATCH /plans/:id 时仅允许白名单字段通过（其余忽略） */
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
  /** 按天/按周打卡表（DeepSeek 生成 + 可编辑覆盖） */
  schedule?: CheckinSchedule;
  stages: DraftStage[];
  createdAt: string;
};

type DraftState = {
  planId: string;
  versions: PlanVersionSnapshot[];
  maxVersions: number;
  confirmedVersion: number | null;
};

/** ISO/日期字符串转本地日历「当天零点」，用于数计划跨度天数 */
function toDateOnly(input: string) {
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/** 起止日期包含两端，至少 1 天（与前端「起止日」选择一致） */
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

/**
 * 打卡表粒度决策（用于 schedule，不影响 stages/tasks 的 timeSlot 规则）。
 *
 * - deep：按天
 * - rough：按周
 * - smart：<=92 天按天，否则按周（与“<=3个月推荐深度”一致）
 */
export function decideScheduleGranularity(params: {
  mode: GranularityMode;
  startDate: string;
  endDate: string;
}): ScheduleGranularity {
  if (params.mode === 'deep') return 'day';
  if (params.mode === 'rough') return 'week';

  const start = toDateOnly(params.startDate);
  const end = toDateOnly(params.endDate);
  const durationDays = daysBetweenInclusive(start, end);
  return durationDays <= 92 ? 'day' : 'week';
}

/**
 * 构造 schedule 的 slotKey 列表（用于“按天/按周打卡”的骨架）。
 * - day：起止包含两端，YYYY-MM-DD
 * - week：W1..Wn，n=ceil(durationDays/7)
 */
export function buildScheduleSlotKeys(params: {
  granularity: ScheduleGranularity;
  startDate: string;
  endDate: string;
}): string[] {
  const start = toDateOnly(params.startDate);
  const end = toDateOnly(params.endDate);
  const durationDays = daysBetweenInclusive(start, end);

  if (params.granularity === 'week') {
    const weeks = Math.max(1, Math.ceil(durationDays / 7));
    return Array.from({ length: weeks }, (_, i) => `W${i + 1}`);
  }

  const keys: string[] = [];
  for (let i = 0; i < durationDays; i += 1) {
    const next = new Date(start);
    next.setDate(start.getDate() + i);
    keys.push(formatDayKey(next));
  }
  return keys;
}

/** 为每个「行动任务」生成与 slotType 对齐的 key：日=YYYY-MM-DD 递增，周=Wn，月=Mn */
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

/**
 * 在 ai-engine 给出的「纯任务列表」上叠加时间维：每条任务补 timeSlotType/Key，并按规则追加周/月总结任务。
 * 每个阶段独立追加总结行（id 带 stage.sortOrder 防冲突）。
 */
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

/**
 * 生成某一「逻辑版本」的快照：先走引擎再套颗粒度；requirement/deadline 来自入参，写入 PlanVersion 与展示一致。
 */
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

/** 无版本记录时根据当前 Plan 字段生成 v1 快照并写入 PlanVersion */
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
  schedule?: unknown;
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
    schedule: (version.schedule && typeof version.schedule === 'object' ? (version.schedule as CheckinSchedule) : undefined),
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
  const schedules = (await prisma.$queryRawUnsafe(
    'SELECT version, schedule FROM "PlanVersion" WHERE "planId" = $1 ORDER BY version ASC',
    plan.id
  )) as Array<{ version: number; schedule: unknown | null }>;
  const scheduleByVersion = new Map<number, unknown>();
  for (const row of schedules) {
    if (row && typeof row.version === 'number' && row.schedule != null) {
      scheduleByVersion.set(row.version, row.schedule);
    }
  }
  return {
    planId: plan.id,
    versions: versions.map((item) => toSnapshot({ ...item, schedule: scheduleByVersion.get(item.version) })),
    maxVersions: MAX_VERSIONS,
    confirmedVersion: plan.confirmedVersion,
  };
}

/** 按 planId 加载草稿状态（不校验归属，供内部或管理用途） */
export async function getDraftState(planId: string) {
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
  });
  if (!plan) return null;
  return await loadDraftState(plan);
}

/** 用户维度的计划详情 + 草稿元数据（版本列表、是否还可 regenerate） */
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

/** 仅返回草稿 bundle；若计划已 active 或不存在则返回错误码 */
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

/** 在未确认前基于当前 requirement（可覆盖）与颗粒度生成新版本快照，受 MAX_VERSIONS 限制 */
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

  // schedule：优先继承上一版的骨架（slotKeys + 粒度），避免依赖 startDate 重新计算
  const prevSchedule = state.versions[state.versions.length - 1]?.schedule;
  const expectedGranularity = prevSchedule?.granularity ?? decideScheduleGranularity({
    mode: effectiveGranularityMode,
    startDate: plan.deadline.toISOString(),
    endDate: plan.deadline.toISOString(),
  });
  const slotKeys =
    prevSchedule?.slots?.map((s) => s.slotKey) ??
    buildScheduleSlotKeys({
      granularity: expectedGranularity,
      startDate: plan.deadline.toISOString(),
      endDate: plan.deadline.toISOString(),
    });

  const rawRequirement = requirement?.trim() ? requirement : plan.requirement;
  const jsonBlock = extractLastJsonCodeBlock(rawRequirement);
  const wire = jsonBlock ? parseScheduleWireOrNull(jsonBlock) : null;
  const validated = wire
    ? validateScheduleStrict({
        expectedGranularity,
        expectedSlotKeys: slotKeys,
        wire,
      })
    : ({ ok: false as const, reason: 'missing json' } as const);
  const schedule = validated.ok ? validated.schedule : buildFallbackSchedule({ granularity: expectedGranularity, slotKeys });
  const requirementText = jsonBlock ? stripLastJsonCodeBlock(rawRequirement) : rawRequirement.trim();

  const nextSnapshot = buildSnapshot(
    {
      goal: plan.goal,
      deadline: plan.deadline.toISOString(),
      requirement: requirementText,
      type: plan.type as GeneratePlanInput['type'],
    },
    nextVersion,
    {
      granularityMode: effectiveGranularityMode,
      startDateIso: plan.deadline.toISOString(),
    }
  );
  nextSnapshot.schedule = schedule;
  await prisma.planVersion.create({
    data: {
      planId,
      version: nextVersion,
      requirement: nextSnapshot.requirement,
      deadline: new Date(nextSnapshot.deadline),
      snapshot: nextSnapshot.stages,
    },
  });
  // schedule raw update（见 createGeneratedPlan 注释）
  await prisma.$executeRawUnsafe(
    'UPDATE "PlanVersion" SET schedule = $1::jsonb WHERE "planId" = $2 AND version = $3',
    JSON.stringify(schedule),
    planId,
    nextVersion
  );

  await prisma.plan.update({
    where: { id: planId },
    data: { currentVersion: nextVersion },
  });

  const refreshedPlan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });
  const refreshedState = await loadDraftState(refreshedPlan);
  return { ok: true as const, state: refreshedState };
}

/** 选定某一草稿版本定稿：计划转 active，后续关闭草稿接口 */
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

/** 对比两个版本快照中的阶段/任务名称差异（供前端 diff 展示） */
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

/** 创建新计划（草稿）：写 Plan、PlanStage、PlanVersion v1，并返回带 draft 摘要的响应体 */
export async function createGeneratedPlan(
  input: GeneratePlanInput & {
    userId: string;
    granularityMode?: GranularityMode;
    startDateIso?: string;
  }
) {
  const effectiveGranularityMode: GranularityMode = input.granularityMode ?? 'smart';
  const startDateIso = input.startDateIso ?? input.deadline;
  const expectedGranularity = decideScheduleGranularity({
    mode: effectiveGranularityMode,
    startDate: startDateIso,
    endDate: input.deadline,
  });
  const slotKeys = buildScheduleSlotKeys({
    granularity: expectedGranularity,
    startDate: startDateIso,
    endDate: input.deadline,
  });

  const jsonBlock = extractLastJsonCodeBlock(input.requirement);
  const wire = jsonBlock ? parseScheduleWireOrNull(jsonBlock) : null;
  const validated = wire
    ? validateScheduleStrict({
        expectedGranularity,
        expectedSlotKeys: slotKeys,
        wire,
      })
    : ({ ok: false as const, reason: 'missing json' } as const);
  const schedule = validated.ok ? validated.schedule : buildFallbackSchedule({ granularity: expectedGranularity, slotKeys });

  const requirementText = jsonBlock ? stripLastJsonCodeBlock(input.requirement) : input.requirement.trim();

  const snapshot = buildSnapshot(
    { ...input, requirement: requirementText, granularityMode: effectiveGranularityMode, startDateIso },
    1,
    {
      granularityMode: effectiveGranularityMode,
      startDateIso,
    }
  );
  snapshot.schedule = schedule;

  return prisma.$transaction(async (tx) => {
    const createdPlan = await tx.plan.create({
      data: {
        userId: input.userId,
        goal: input.goal,
        deadline: new Date(input.deadline),
        requirement: requirementText,
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

    const createdVersion = await tx.planVersion.create({
      data: {
        planId: createdPlan.id,
        version: 1,
        requirement: requirementText,
        deadline: new Date(input.deadline),
        snapshot: snapshot.stages,
      },
    });
    // Prisma Client 可能因 Windows EPERM 无法及时 generate（schema 新增字段），这里用 raw SQL 写入 schedule
    await tx.$executeRawUnsafe(
      'UPDATE "PlanVersion" SET schedule = $1::jsonb WHERE id = $2',
      JSON.stringify(schedule),
      createdVersion.id
    );

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

/** 将 v1 与 Plan 主档的 requirement 同步更新（草稿态），用于流式 AI 生成完成后落库 */
export async function updatePlanV1Requirement(planId: string, userId: string, requirement: string) {
  const plan = await prisma.plan.findFirst({ where: { id: planId, userId } });
  if (!plan) return { ok: false as const, code: 404 as const, message: 'plan not found' };
  if (plan.status !== 'draft') return { ok: false as const, code: 409 as const, message: 'draft is closed' };
  const raw = requirement.trim();
  if (!raw) return { ok: false as const, code: 400 as const, message: 'requirement is empty' };

  // schedule 更新：若正文尾部带 ```json，则尝试解析并严格校验 slotKey 骨架；失败则保持当前 schedule 不变
  const existing = (await prisma.$queryRawUnsafe(
    'SELECT schedule FROM "PlanVersion" WHERE "planId" = $1 AND version = 1 LIMIT 1',
    planId
  )) as Array<{ schedule: unknown | null }>;
  const prevSchedule = existing[0]?.schedule as CheckinSchedule | null | undefined;
  const expectedGranularity: ScheduleGranularity = prevSchedule?.granularity ?? 'day';
  const slotKeys = prevSchedule?.slots?.map((s) => s.slotKey) ?? [];

  const jsonBlock = extractLastJsonCodeBlock(raw);
  const wire = jsonBlock ? parseScheduleWireOrNull(jsonBlock) : null;
  const validated =
    wire && slotKeys.length > 0
      ? validateScheduleStrict({
          expectedGranularity,
          expectedSlotKeys: slotKeys,
          wire,
        })
      : ({ ok: false as const, reason: 'no prev schedule or missing json' } as const);
  const requirementText = jsonBlock ? stripLastJsonCodeBlock(raw) : raw;

  await prisma.$transaction(async (tx) => {
    await tx.plan.update({ where: { id: planId }, data: { requirement: requirementText } });
    await tx.planVersion.updateMany({ where: { planId, version: 1 }, data: { requirement: requirementText } });
    if (validated.ok) {
      await tx.$executeRawUnsafe(
        'UPDATE "PlanVersion" SET schedule = $1::jsonb WHERE "planId" = $2 AND version = 1',
        JSON.stringify(validated.schedule),
        planId
      );
    }
  });
  return { ok: true as const };
}

export async function updatePlanScheduleSlot(params: {
  planId: string;
  userId: string;
  slotKey: string;
  content?: string;
  restore?: boolean;
}) {
  const plan = await prisma.plan.findFirst({
    where: { id: params.planId, userId: params.userId },
  });
  if (!plan) return { ok: false as const, code: 404 as const, message: 'plan not found' };

  const version = plan.confirmedVersion ?? plan.currentVersion ?? 1;
  const rows = (await prisma.$queryRawUnsafe(
    'SELECT schedule FROM "PlanVersion" WHERE "planId" = $1 AND version = $2 LIMIT 1',
    params.planId,
    version
  )) as Array<{ schedule: unknown | null }>;
  const schedule = rows[0]?.schedule as CheckinSchedule | null | undefined;
  if (!schedule || !Array.isArray(schedule.slots)) {
    return { ok: false as const, code: 404 as const, message: 'schedule not found' };
  }

  const idx = schedule.slots.findIndex((s) => s.slotKey === params.slotKey);
  if (idx < 0) return { ok: false as const, code: 404 as const, message: 'slot not found' };

  const slot = schedule.slots[idx]!;
  const nowIso = new Date().toISOString();
  if (params.restore) {
    slot.content = slot.generatedContent;
    slot.contentSource = 'generated';
    delete slot.editedAt;
    delete slot.editedByUserId;
  } else {
    const next = (params.content ?? '').trim();
    if (!next) return { ok: false as const, code: 400 as const, message: 'content is empty' };
    slot.content = next;
    slot.contentSource = 'edited';
    slot.editedAt = nowIso;
    slot.editedByUserId = params.userId;
  }
  schedule.slots[idx] = slot;

  await prisma.$executeRawUnsafe(
    'UPDATE "PlanVersion" SET schedule = $1::jsonb WHERE "planId" = $2 AND version = $3',
    JSON.stringify(schedule),
    params.planId,
    version
  );

  return { ok: true as const, schedule, slot };
}
