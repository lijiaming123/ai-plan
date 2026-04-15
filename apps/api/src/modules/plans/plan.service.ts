/**
 * 计划核心业务（草稿 / 定稿 / 版本树）。
 *
 * 数据模型关系（简化）：
 * - Plan：已定稿计划主档（仅确认后写入；生成中数据在 PlanGenerationDraft）。
 * - PlanGenerationDraft / Version / Stage：仅创建流程，定稿后删除并迁入 Plan。
 * - PlanVersion：`snapshot` 存 JSON 阶段+任务；最多 MAX_VERSIONS 个生成版本。
 *
 * 生成管线：generatePlanDraft(ai-engine) → buildSnapshot → withTimeSlots(granularity) 写入快照。
 * 重新生成：若已配置 DEEPSEEK_API_KEY，则优先调用 DeepSeek 产出新版正文 + 打卡 JSON；失败或未配置时回退为本地解析/模板。
 * 对外导出函数见各 export 上方注释；本文件中部多为纯函数与 Prisma 事务。
 */
import { prisma } from "../../lib/prisma";
import { completeDeepseekChat, isDeepseekConfigured } from "../../lib/deepseek";
import {
  generatePlanDraft,
  type GeneratePlanInput,
} from "@ai-plan/ai-engine/client";
import {
  resolveGranularityPlan,
  type GranularityMode,
  type SlotType,
} from "./granularity";
import {
  buildFallbackSchedule,
  extractLastJsonCodeBlock,
  parseScheduleWireOrNull,
  stripLastJsonCodeBlock,
  validateScheduleStrict,
  type CheckinSchedule,
} from "./deepseek-schedule";
import { listScheduleSlotSubmissionsBySlot } from "./schedule-slot-checkin.service";

const editableFields = ["deadline", "note"] as const;

export type ScheduleGranularity = "day" | "week";

/** PATCH /plans/:id 时仅允许白名单字段通过（其余忽略） */
export function sanitizePlanPatch(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) =>
      editableFields.includes(key as (typeof editableFields)[number]),
    ),
  );
}

type DraftTask = {
  id: string;
  title: string;
  order: number;
  timeSlotType?: SlotType;
  timeSlotKey?: string;
  taskType?: "action" | "weekly_summary" | "monthly_summary";
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
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
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
  if (params.mode === "deep") return "day";
  if (params.mode === "rough") return "week";

  const start = toDateOnly(params.startDate);
  const end = toDateOnly(params.endDate);
  const durationDays = daysBetweenInclusive(start, end);
  return durationDays <= 92 ? "day" : "week";
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

  if (params.granularity === "week") {
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
function buildTaskKeys(params: {
  slotType: SlotType;
  taskCount: number;
  startDate: Date;
}) {
  const keys: string[] = [];
  for (let i = 0; i < params.taskCount; i += 1) {
    if (params.slotType === "day") {
      const next = new Date(params.startDate);
      next.setDate(params.startDate.getDate() + i);
      keys.push(formatDayKey(next));
      continue;
    }
    if (params.slotType === "week") {
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
  stages: Array<{
    name: string;
    sortOrder: number;
    tasks: Array<{ id: string; title: string; order: number }>;
  }>,
  options: {
    granularityMode: GranularityMode;
    startDateIso: string;
    deadlineIso: string;
  },
) {
  const startDate = toDateOnly(options.startDateIso);
  const deadline = toDateOnly(options.deadlineIso);
  const durationDays = daysBetweenInclusive(startDate, deadline);
  const rule = resolveGranularityPlan({
    mode: options.granularityMode,
    durationDays,
  });
  const slotType = rule.slots[0] ?? "day";

  return stages.map((stage) => {
    const keys = buildTaskKeys({
      slotType,
      taskCount: stage.tasks.length,
      startDate,
    });
    const taskList: DraftTask[] = stage.tasks.map((task, index) => ({
      ...task,
      timeSlotType: slotType,
      timeSlotKey:
        keys[index] ?? keys[keys.length - 1] ?? formatDayKey(startDate),
      taskType: "action",
    }));

    if (rule.summaries.includes("weekly")) {
      taskList.push({
        id: `weekly-summary-${stage.sortOrder}`,
        title: "本周总结与复盘",
        order: taskList.length + 1,
        timeSlotType: "week",
        timeSlotKey: `W${Math.max(1, Math.ceil(durationDays / 7))}`,
        taskType: "weekly_summary",
      });
    }
    if (rule.summaries.includes("monthly")) {
      taskList.push({
        id: `monthly-summary-${stage.sortOrder}`,
        title: "本月总结与复盘",
        order: taskList.length + 1,
        timeSlotType: "month",
        timeSlotKey: `M${Math.max(1, Math.ceil(durationDays / 30))}`,
        taskType: "monthly_summary",
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
  options?: { granularityMode?: GranularityMode; startDateIso?: string },
): PlanVersionSnapshot {
  const draft = generatePlanDraft(input);
  const granularityMode = options?.granularityMode ?? "smart";
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
  currentVersion: number;
  confirmedVersion: number | null;
};

type GenerationDraftRow = {
  id: string;
  userId: string;
  goal: string;
  deadline: Date;
  requirement: string;
  type: string;
  currentVersion: number;
};

/** 无版本记录时根据当前 Plan 字段生成 v1 快照并写入 PlanVersion */
async function ensureBaselineVersion(plan: PlanRow) {
  const firstVersion = await prisma.planVersion.findFirst({
    where: { planId: plan.id },
    orderBy: { version: "asc" },
  });
  if (firstVersion) return;

  const snapshot = buildSnapshot(
    {
      goal: plan.goal,
      deadline: plan.deadline.toISOString(),
      requirement: plan.requirement,
      type: plan.type as GeneratePlanInput["type"],
    },
    1,
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
  const stages = (
    Array.isArray(version.snapshot) ? version.snapshot : []
  ) as DraftStage[];
  const allTasks = stages.flatMap((stage) => stage.tasks);
  const granularityMode: GranularityMode | undefined = allTasks.some(
    (task) =>
      task.taskType === "weekly_summary" || task.taskType === "monthly_summary",
  )
    ? "deep"
    : allTasks.some((task) => task.timeSlotType === "week")
      ? "rough"
      : undefined;
  return {
    version: version.version,
    requirement: version.requirement,
    deadline: version.deadline.toISOString(),
    granularityMode,
    schedule:
      version.schedule && typeof version.schedule === "object"
        ? (version.schedule as CheckinSchedule)
        : undefined,
    stages,
    createdAt: version.createdAt.toISOString(),
  };
}

async function loadPersistedPlanState(plan: PlanRow): Promise<DraftState> {
  await ensureBaselineVersion(plan);
  const versions = await prisma.planVersion.findMany({
    where: { planId: plan.id },
    orderBy: { version: "asc" },
  });
  const schedules = (await prisma.$queryRawUnsafe(
    'SELECT version, schedule FROM "PlanVersion" WHERE "planId" = $1 ORDER BY version ASC',
    plan.id,
  )) as Array<{ version: number; schedule: unknown | null }>;
  const scheduleByVersion = new Map<number, unknown>();
  for (const row of schedules) {
    if (row && typeof row.version === "number" && row.schedule != null) {
      scheduleByVersion.set(row.version, row.schedule);
    }
  }
  return {
    planId: plan.id,
    versions: versions.map((item) =>
      toSnapshot({ ...item, schedule: scheduleByVersion.get(item.version) }),
    ),
    maxVersions: MAX_VERSIONS,
    confirmedVersion: plan.confirmedVersion,
  };
}

async function loadGenerationDraftState(
  draft: GenerationDraftRow,
): Promise<DraftState> {
  const versions = await prisma.planGenerationDraftVersion.findMany({
    where: { draftId: draft.id },
    orderBy: { version: "asc" },
  });
  const schedules = (await prisma.$queryRawUnsafe(
    'SELECT version, schedule FROM "PlanGenerationDraftVersion" WHERE "draftId" = $1 ORDER BY version ASC',
    draft.id,
  )) as Array<{ version: number; schedule: unknown | null }>;
  const scheduleByVersion = new Map<number, unknown>();
  for (const row of schedules) {
    if (row && typeof row.version === "number" && row.schedule != null) {
      scheduleByVersion.set(row.version, row.schedule);
    }
  }
  return {
    planId: draft.id,
    versions: versions.map((item) =>
      toSnapshot({ ...item, schedule: scheduleByVersion.get(item.version) }),
    ),
    maxVersions: MAX_VERSIONS,
    confirmedVersion: null,
  };
}

/** 按 id 加载生成中草稿状态（不校验归属） */
export async function getDraftState(draftId: string) {
  const draft = await prisma.planGenerationDraft.findUnique({
    where: { id: draftId },
  });
  if (!draft) return null;
  return await loadGenerationDraftState(draft);
}

const planListSelect = {
  id: true,
  goal: true,
  deadline: true,
  requirement: true,
  type: true,
  createdAt: true,
} as const;

function mapPlanListRow(row: {
  id: string;
  goal: string;
  deadline: Date;
  requirement: string;
  type: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    goal: row.goal,
    deadline: row.deadline.toISOString(),
    requirement: row.requirement,
    type: row.type,
    status: "active",
    createdAt: row.createdAt.toISOString(),
  };
}

export type PlanListSort = "created_desc" | "deadline_asc";

/** 计划列表（我的计划）：仅已定稿 Plan 表。默认按创建时间倒序；`deadline_asc` 按截止日期升序（更近的在前）。 */
export async function listPlansForUser(
  userId: string,
  options?: { sort?: PlanListSort },
) {
  const sort: PlanListSort = options?.sort ?? "created_desc";
  const orderBy =
    sort === "deadline_asc"
      ? ({ deadline: "asc" } as const)
      : ({ createdAt: "desc" } as const);
  const rows = await prisma.plan.findMany({
    where: { userId },
    orderBy,
    select: planListSelect,
  });
  return rows.map(mapPlanListRow);
}

/** 用户维度的计划详情 + 草稿元数据（版本列表、是否还可 regenerate） */
export async function getPlanWithDraft(planId: string, userId: string) {
  const plan = await prisma.plan.findFirst({
    where: { id: planId, userId },
  });
  if (!plan) return null;
  const state = await loadPersistedPlanState(plan);
  const scheduleSlotSubmissions = await listScheduleSlotSubmissionsBySlot(
    planId,
    userId,
  );
  return {
    ...plan,
    status: "active",
    draft: {
      versions: state.versions,
      maxVersions: state.maxVersions,
      confirmedVersion: state.confirmedVersion,
      canRegenerate:
        state.versions.length < state.maxVersions &&
        state.confirmedVersion === null,
    },
    scheduleSlotSubmissions,
  };
}

/** 生成中草稿页：返回版本 bundle + 主档字段（无定稿 Plan 行） */
export async function getPlanDraft(draftId: string, userId: string) {
  const draft = await prisma.planGenerationDraft.findFirst({
    where: { id: draftId, userId },
  });
  if (!draft)
    return {
      ok: false as const,
      code: 404 as const,
      message: "plan not found",
    };
  const state = await loadGenerationDraftState(draft);
  return {
    ok: true as const,
    draft: {
      goal: draft.goal,
      deadline: draft.deadline.toISOString(),
      type: draft.type,
      requirement: draft.requirement,
      versions: state.versions,
      maxVersions: state.maxVersions,
      confirmedVersion: state.confirmedVersion,
      canRegenerate:
        state.versions.length < state.maxVersions &&
        state.confirmedVersion === null,
    },
  };
}

/** 与 /plans/assistant、流式 draft 共用的人设（中文计划正文风格）；供 regenerate-stream 路由引用 */
export const REGENERATE_PLAN_SYSTEM =
  "你是「计划大师」的 AI 计划顾问。根据用户给出的信息与要求，用中文输出可直接作为「计划内容」保存的正文：务实用语、分阶段目标与验收、可执行任务（优先按周，必要时到天）、风险与应对、复盘建议。不要输出与计划无关的寒暄。";

function buildRegenerateUserContentForModel(params: {
  goal: string;
  planType: string;
  deadlineIso: string;
  baseRequirement: string;
  effectiveGranularityMode: GranularityMode;
  expectedGranularity: ScheduleGranularity;
  slotKeys: string[];
}): string {
  const {
    goal,
    planType,
    deadlineIso,
    baseRequirement,
    effectiveGranularityMode,
    expectedGranularity,
    slotKeys,
  } = params;

  let deadlineLabel: string;
  try {
    deadlineLabel = new Date(deadlineIso).toLocaleDateString("zh-CN");
  } catch {
    deadlineLabel = deadlineIso;
  }

  const bodyText = (() => {
    const jb = extractLastJsonCodeBlock(baseRequirement);
    return jb ? stripLastJsonCodeBlock(baseRequirement) : baseRequirement;
  })().trim();

  return [
    "请基于以下「当前版本」重新生成一整版计划说明（将作为草稿新版本保存）。在保持目标一致的前提下，可优化阶段表述、验收要点与每日/每周打卡文案；不要简单复述原文。",
    "",
    `目标：${goal}`,
    `计划类型：${planType}`,
    `截止日期：${deadlineLabel}`,
    `颗粒度设置：${effectiveGranularityMode}（打卡表必须使用粒度：${expectedGranularity}）`,
    "",
    "【当前版本正文】",
    bodyText || "（暂无）",
    "",
    "请输出：",
    "1) 可直接保存为「计划内容」的中文正文；",
    "2) 在最后输出一个严格的 JSON 代码块（```json ...```），仅包含如下结构：",
    "{",
    '  "schedule": {',
    `    "granularity": "${expectedGranularity}",`,
    '    "slots": [',
    '      { "slotKey": "...", "content": "..." }',
    "    ]",
    "  }",
    "}",
    "注意：slotKey 必须严格来自下方「时间槽」列表，且顺序必须完全一致；content 为当期计划一段中文（1-3句，具体可执行）。",
    "",
    "时间槽：",
    ...slotKeys.map((k) => `- ${k}`),
  ].join("\n");
}

export function parseRegenerateFallbackFromBaseRequirement(
  rawRequirement: string,
  expectedGranularity: ScheduleGranularity,
  slotKeys: string[],
): { requirementText: string; schedule: CheckinSchedule } {
  const jsonBlock = extractLastJsonCodeBlock(rawRequirement);
  const wire = jsonBlock ? parseScheduleWireOrNull(jsonBlock) : null;
  const validated = wire
    ? validateScheduleStrict({
        expectedGranularity,
        expectedSlotKeys: slotKeys,
        wire,
      })
    : ({ ok: false as const, reason: "missing json" } as const);
  const schedule = validated.ok
    ? validated.schedule
    : buildFallbackSchedule({ granularity: expectedGranularity, slotKeys });
  const requirementText = jsonBlock
    ? stripLastJsonCodeBlock(rawRequirement)
    : rawRequirement.trim();
  return { requirementText, schedule };
}

/** 供 regenerate-stream：在落库前固定「下一版本」上下文与发给模型的 user 正文 */
export type RegenerateStreamContext = {
  draftId: string;
  userId: string;
  nextVersion: number;
  effectiveGranularityMode: GranularityMode;
  expectedGranularity: ScheduleGranularity;
  slotKeys: string[];
  rawRequirement: string;
  userContent: string;
  goal: string;
  deadlineIso: string;
  planType: string;
};

function parseRegenerateModelOutput(
  fullRaw: string,
  ctx: Pick<
    RegenerateStreamContext,
    "expectedGranularity" | "slotKeys" | "rawRequirement"
  >,
): { requirementText: string; schedule: CheckinSchedule } {
  const trimmed = fullRaw.trim();
  if (!trimmed) {
    return parseRegenerateFallbackFromBaseRequirement(
      ctx.rawRequirement,
      ctx.expectedGranularity,
      ctx.slotKeys,
    );
  }
  const jsonBlock = extractLastJsonCodeBlock(trimmed);
  const wire = jsonBlock ? parseScheduleWireOrNull(jsonBlock) : null;
  const validated = wire
    ? validateScheduleStrict({
        expectedGranularity: ctx.expectedGranularity,
        expectedSlotKeys: ctx.slotKeys,
        wire,
      })
    : ({ ok: false as const, reason: "missing json" } as const);
  const schedule = validated.ok
    ? validated.schedule
    : buildFallbackSchedule({
        granularity: ctx.expectedGranularity,
        slotKeys: ctx.slotKeys,
      });
  const requirementText = (
    jsonBlock ? stripLastJsonCodeBlock(trimmed) : trimmed
  ).trim();
  return { requirementText, schedule };
}

export async function prepareRegeneratePlanStream(
  draftId: string,
  userId: string,
  requirement?: string,
  granularityMode?: GranularityMode,
): Promise<
  | { ok: true; ctx: RegenerateStreamContext }
  | { ok: false; code: number; message: string }
> {
  const draft = await prisma.planGenerationDraft.findFirst({
    where: { id: draftId, userId },
  });
  if (!draft) return { ok: false, code: 404, message: "plan not found" };

  const state = await loadGenerationDraftState(draft);
  if (state.versions.length >= state.maxVersions) {
    return { ok: false, code: 409, message: "version limit reached" };
  }

  const nextVersion = state.versions.length + 1;
  const effectiveGranularityMode =
    granularityMode ??
    state.versions[state.versions.length - 1]?.granularityMode ??
    "smart";

  const prevSchedule = state.versions[state.versions.length - 1]?.schedule;
  const expectedGranularity =
    prevSchedule?.granularity ??
    decideScheduleGranularity({
      mode: effectiveGranularityMode,
      startDate: draft.deadline.toISOString(),
      endDate: draft.deadline.toISOString(),
    });
  const slotKeys =
    prevSchedule?.slots?.map((s) => s.slotKey) ??
    buildScheduleSlotKeys({
      granularity: expectedGranularity,
      startDate: draft.deadline.toISOString(),
      endDate: draft.deadline.toISOString(),
    });

  const rawRequirement = requirement?.trim() ? requirement : draft.requirement;

  const userContent = buildRegenerateUserContentForModel({
    goal: draft.goal,
    planType: draft.type,
    deadlineIso: draft.deadline.toISOString(),
    baseRequirement: rawRequirement,
    effectiveGranularityMode,
    expectedGranularity,
    slotKeys,
  });

  return {
    ok: true,
    ctx: {
      draftId,
      userId,
      nextVersion,
      effectiveGranularityMode,
      expectedGranularity,
      slotKeys,
      rawRequirement,
      userContent,
      goal: draft.goal,
      deadlineIso: draft.deadline.toISOString(),
      planType: draft.type,
    },
  };
}

async function persistRegenerateVersionAfterParse(
  ctx: RegenerateStreamContext,
  requirementText: string,
  schedule: CheckinSchedule,
): Promise<
  { ok: true; state: DraftState } | { ok: false; code: number; message: string }
> {
  const draft = await prisma.planGenerationDraft.findFirst({
    where: { id: ctx.draftId, userId: ctx.userId },
  });
  if (!draft) return { ok: false, code: 404, message: "plan not found" };

  const state = await loadGenerationDraftState(draft);
  if (state.versions.length !== ctx.nextVersion - 1) {
    return { ok: false, code: 409, message: "version conflict" };
  }
  if (state.versions.length >= state.maxVersions) {
    return { ok: false, code: 409, message: "version limit reached" };
  }

  const nextSnapshot = buildSnapshot(
    {
      goal: ctx.goal,
      deadline: ctx.deadlineIso,
      requirement: requirementText,
      type: ctx.planType as GeneratePlanInput["type"],
    },
    ctx.nextVersion,
    {
      granularityMode: ctx.effectiveGranularityMode,
      startDateIso: ctx.deadlineIso,
    },
  );
  nextSnapshot.schedule = schedule;
  try {
    const createdVer = await prisma.planGenerationDraftVersion.create({
      data: {
        draftId: ctx.draftId,
        version: ctx.nextVersion,
        requirement: nextSnapshot.requirement,
        deadline: new Date(nextSnapshot.deadline),
        snapshot: nextSnapshot.stages,
      },
    });
    await prisma.$executeRawUnsafe(
      'UPDATE "PlanGenerationDraftVersion" SET schedule = $1::jsonb WHERE id = $2',
      JSON.stringify(schedule),
      createdVer.id,
    );

    await prisma.planGenerationDraft.update({
      where: { id: ctx.draftId },
      data: { currentVersion: ctx.nextVersion },
    });

    const refreshed = await prisma.planGenerationDraft.findUniqueOrThrow({
      where: { id: ctx.draftId },
    });
    const refreshedState = await loadGenerationDraftState(refreshed);
    return { ok: true, state: refreshedState };
  } catch (e) {
    return {
      ok: false,
      code: 500,
      message: e instanceof Error ? e.message : "persist failed",
    };
  }
}

/** 流式结束后用完整模型输出落库新版本 */
export async function persistRegenerateVersionFromStreamOutput(
  ctx: RegenerateStreamContext,
  fullRawFromModel: string,
): Promise<
  { ok: true; state: DraftState } | { ok: false; code: number; message: string }
> {
  const { requirementText, schedule } = parseRegenerateModelOutput(
    fullRawFromModel,
    ctx,
  );
  if (!requirementText.trim()) {
    return { ok: false, code: 400, message: "requirement is empty" };
  }
  return persistRegenerateVersionAfterParse(ctx, requirementText, schedule);
}

/**
 * 调用 DeepSeek 生成「新版本说明 + 严格 schedule JSON」。
 * 未配置 KEY、网络/解析失败时返回 null，由调用方走本地回退。
 */
async function tryRegeneratePlanContentWithDeepseek(params: {
  goal: string;
  planType: string;
  deadlineIso: string;
  baseRequirement: string;
  effectiveGranularityMode: GranularityMode;
  expectedGranularity: ScheduleGranularity;
  slotKeys: string[];
}): Promise<{ requirementMarkdown: string; schedule: CheckinSchedule } | null> {
  if (!isDeepseekConfigured()) return null;

  const userContent = buildRegenerateUserContentForModel(params);

  try {
    const deepseekRaw = await completeDeepseekChat([
      { role: "system", content: REGENERATE_PLAN_SYSTEM },
      { role: "user", content: userContent },
    ]);
    const jsonBlock = extractLastJsonCodeBlock(deepseekRaw);
    const wire = jsonBlock ? parseScheduleWireOrNull(jsonBlock) : null;
    const validated = wire
      ? validateScheduleStrict({
          expectedGranularity: params.expectedGranularity,
          expectedSlotKeys: params.slotKeys,
          wire,
        })
      : ({ ok: false as const, reason: "missing json" } as const);
    const schedule = validated.ok
      ? validated.schedule
      : buildFallbackSchedule({
          granularity: params.expectedGranularity,
          slotKeys: params.slotKeys,
        });
    const requirementMarkdown = (
      jsonBlock ? stripLastJsonCodeBlock(deepseekRaw) : deepseekRaw
    ).trim();
    return { requirementMarkdown, schedule };
  } catch {
    return null;
  }
}

/** 在未确认前基于当前 requirement（可覆盖）与颗粒度生成新版本快照，受 MAX_VERSIONS 限制 */
export async function regeneratePlanVersion(
  draftId: string,
  userId: string,
  requirement?: string,
  granularityMode?: GranularityMode,
) {
  const prep = await prepareRegeneratePlanStream(
    draftId,
    userId,
    requirement,
    granularityMode,
  );
  if (!prep.ok) return prep;

  const { ctx } = prep;
  const deepseekRegen = await tryRegeneratePlanContentWithDeepseek({
    goal: ctx.goal,
    planType: ctx.planType,
    deadlineIso: ctx.deadlineIso,
    baseRequirement: ctx.rawRequirement,
    effectiveGranularityMode: ctx.effectiveGranularityMode,
    expectedGranularity: ctx.expectedGranularity,
    slotKeys: ctx.slotKeys,
  });

  let schedule: CheckinSchedule;
  let requirementText: string;

  if (deepseekRegen) {
    schedule = deepseekRegen.schedule;
    requirementText = deepseekRegen.requirementMarkdown;
  } else {
    const fb = parseRegenerateFallbackFromBaseRequirement(
      ctx.rawRequirement,
      ctx.expectedGranularity,
      ctx.slotKeys,
    );
    schedule = fb.schedule;
    requirementText = fb.requirementText;
  }

  const persisted = await persistRegenerateVersionAfterParse(
    ctx,
    requirementText,
    schedule,
  );
  if (!persisted.ok) {
    return {
      ok: false as const,
      code: persisted.code as 404 | 409 | 500,
      message: persisted.message,
    };
  }
  return { ok: true as const, state: persisted.state };
}

/** 选定某一生成版本定稿：删除 PlanGenerationDraft 树，以相同 id 写入 Plan（便于 URL 不变） */
export async function confirmPlanVersion(
  draftId: string,
  userId: string,
  version: number,
) {
  const draft = await prisma.planGenerationDraft.findFirst({
    where: { id: draftId, userId },
  });
  if (!draft)
    return {
      ok: false as const,
      code: 404 as const,
      message: "plan not found",
    };

  const state = await loadGenerationDraftState(draft);
  const snapshot = state.versions.find((item) => item.version === version);
  if (!snapshot)
    return {
      ok: false as const,
      code: 404 as const,
      message: "version not found",
    };

  await prisma.$transaction(async (tx) => {
    await tx.planGenerationDraft.delete({ where: { id: draftId } });

    await tx.plan.create({
      data: {
        id: draftId,
        userId: draft.userId,
        goal: draft.goal,
        deadline: new Date(snapshot.deadline),
        requirement: snapshot.requirement,
        type: draft.type,
        currentVersion: version,
        confirmedVersion: version,
      },
    });

    await Promise.all(
      snapshot.stages.map((stage) =>
        tx.planStage.create({
          data: {
            planId: draftId,
            name: stage.name,
            sortOrder: stage.sortOrder,
          },
        }),
      ),
    );

    const pv = await tx.planVersion.create({
      data: {
        planId: draftId,
        version,
        requirement: snapshot.requirement,
        deadline: new Date(snapshot.deadline),
        snapshot: snapshot.stages,
      },
    });

    await tx.$executeRawUnsafe(
      'UPDATE "PlanVersion" SET schedule = $1::jsonb WHERE id = $2',
      JSON.stringify(snapshot.schedule ?? { granularity: "day", slots: [] }),
      pv.id,
    );
  });

  const persisted = await prisma.plan.findUniqueOrThrow({
    where: { id: draftId },
  });
  const refreshedState = await loadPersistedPlanState(persisted);
  return {
    ok: true as const,
    state: refreshedState,
    plan: { ...persisted, status: "active" },
  };
}

/** 对比两个版本快照中的阶段/任务名称差异（供前端 diff 展示；仅生成中草稿） */
export async function compareDraftVersions(
  draftId: string,
  baseVersion: number,
  targetVersion: number,
) {
  const draft = await prisma.planGenerationDraft.findUnique({
    where: { id: draftId },
  });
  if (!draft) return null;
  const state = await loadGenerationDraftState(draft);
  const base = state.versions.find((item) => item.version === baseVersion);
  const target = state.versions.find((item) => item.version === targetVersion);
  if (!base || !target) return null;

  const baseStages = new Set(base.stages.map((stage) => stage.name));
  const targetStages = new Set(target.stages.map((stage) => stage.name));
  const addedStages = [...targetStages].filter((name) => !baseStages.has(name));
  const removedStages = [...baseStages].filter(
    (name) => !targetStages.has(name),
  );

  const baseTasks = new Set(
    base.stages.flatMap((stage) =>
      stage.tasks.map((task) => `${stage.name}::${task.title}`),
    ),
  );
  const targetTasks = new Set(
    target.stages.flatMap((stage) =>
      stage.tasks.map((task) => `${stage.name}::${task.title}`),
    ),
  );
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
  },
) {
  const effectiveGranularityMode: GranularityMode =
    input.granularityMode ?? "smart";
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
    : ({ ok: false as const, reason: "missing json" } as const);
  const schedule = validated.ok
    ? validated.schedule
    : buildFallbackSchedule({ granularity: expectedGranularity, slotKeys });

  const requirementText = jsonBlock
    ? stripLastJsonCodeBlock(input.requirement)
    : input.requirement.trim();

  const snapshot = buildSnapshot(
    {
      goal: input.goal,
      deadline: input.deadline,
      requirement: requirementText,
      type: input.type,
    },
    1,
    {
      granularityMode: effectiveGranularityMode,
      startDateIso,
    },
  );
  snapshot.schedule = schedule;

  return prisma.$transaction(async (tx) => {
    const createdDraft = await tx.planGenerationDraft.create({
      data: {
        userId: input.userId,
        goal: input.goal,
        deadline: new Date(input.deadline),
        requirement: requirementText,
        type: input.type,
        currentVersion: 1,
      },
    });

    const createdStages = await Promise.all(
      snapshot.stages.map((stage) =>
        tx.planGenerationDraftStage.create({
          data: {
            draftId: createdDraft.id,
            name: stage.name,
            sortOrder: stage.sortOrder,
          },
        }),
      ),
    );

    const createdVersion = await tx.planGenerationDraftVersion.create({
      data: {
        draftId: createdDraft.id,
        version: 1,
        requirement: requirementText,
        deadline: new Date(input.deadline),
        snapshot: snapshot.stages,
      },
    });
    await tx.$executeRawUnsafe(
      'UPDATE "PlanGenerationDraftVersion" SET schedule = $1::jsonb WHERE id = $2',
      JSON.stringify(schedule),
      createdVersion.id,
    );

    const response = {
      id: createdDraft.id,
      userId: createdDraft.userId,
      goal: createdDraft.goal,
      deadline: createdDraft.deadline,
      requirement: createdDraft.requirement,
      type: createdDraft.type,
      currentVersion: createdDraft.currentVersion,
      createdAt: createdDraft.createdAt,
      stages: createdStages.map((stage, index) => ({
        id: stage.id,
        name: stage.name,
        sortOrder: stage.sortOrder,
        tasks: snapshot.stages[index]?.tasks ?? [],
      })),
    };
    const state: DraftState = {
      planId: createdDraft.id,
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

/** 将 v1 与生成草稿主档 requirement 同步更新，用于流式 AI 生成完成后落库 */
export async function updatePlanV1Requirement(
  draftId: string,
  userId: string,
  requirement: string,
) {
  const draft = await prisma.planGenerationDraft.findFirst({
    where: { id: draftId, userId },
  });
  if (!draft)
    return {
      ok: false as const,
      code: 404 as const,
      message: "plan not found",
    };
  const raw = requirement.trim();
  if (!raw)
    return {
      ok: false as const,
      code: 400 as const,
      message: "requirement is empty",
    };

  const existing = (await prisma.$queryRawUnsafe(
    'SELECT id, schedule FROM "PlanGenerationDraftVersion" WHERE "draftId" = $1 AND version = 1 LIMIT 1',
    draftId,
  )) as Array<{ id: string; schedule: unknown | null }>;
  const row = existing[0];
  if (!row)
    return {
      ok: false as const,
      code: 404 as const,
      message: "version not found",
    };

  const prevSchedule = row.schedule as CheckinSchedule | null | undefined;
  const expectedGranularity: ScheduleGranularity =
    prevSchedule?.granularity ?? "day";
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
      : ({
          ok: false as const,
          reason: "no prev schedule or missing json",
        } as const);
  const requirementText = jsonBlock ? stripLastJsonCodeBlock(raw) : raw;

  await prisma.$transaction(async (tx) => {
    await tx.planGenerationDraft.update({
      where: { id: draftId },
      data: { requirement: requirementText },
    });
    await tx.planGenerationDraftVersion.updateMany({
      where: { draftId, version: 1 },
      data: { requirement: requirementText },
    });
    if (validated.ok) {
      await tx.$executeRawUnsafe(
        'UPDATE "PlanGenerationDraftVersion" SET schedule = $1::jsonb WHERE id = $2',
        JSON.stringify(validated.schedule),
        row.id,
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
  /** 生成草稿多版本：指定 PlanGenerationDraftVersion.version */
  planVersion?: number;
}) {
  const plan = await prisma.plan.findFirst({
    where: { id: params.planId, userId: params.userId },
  });

  const draft =
    plan == null
      ? await prisma.planGenerationDraft.findFirst({
          where: { id: params.planId, userId: params.userId },
        })
      : null;

  if (!plan && !draft)
    return {
      ok: false as const,
      code: 404 as const,
      message: "plan not found",
    };

  let version: number;
  let table: "plan" | "draft";
  if (draft) {
    table = "draft";
    if (
      params.planVersion != null &&
      Number.isInteger(params.planVersion) &&
      params.planVersion >= 1
    ) {
      version = params.planVersion;
    } else {
      version = draft.currentVersion ?? 1;
    }
  } else {
    table = "plan";
    version = plan!.confirmedVersion ?? plan!.currentVersion ?? 1;
  }

  const scheduleRows =
    table === "plan"
      ? ((await prisma.$queryRawUnsafe(
          'SELECT schedule FROM "PlanVersion" WHERE "planId" = $1 AND version = $2 LIMIT 1',
          params.planId,
          version,
        )) as Array<{ schedule: unknown | null }>)
      : ((await prisma.$queryRawUnsafe(
          'SELECT schedule FROM "PlanGenerationDraftVersion" WHERE "draftId" = $1 AND version = $2 LIMIT 1',
          params.planId,
          version,
        )) as Array<{ schedule: unknown | null }>);

  const schedule = scheduleRows[0]?.schedule as
    | CheckinSchedule
    | null
    | undefined;
  if (!schedule || !Array.isArray(schedule.slots)) {
    return {
      ok: false as const,
      code: 404 as const,
      message: "schedule not found",
    };
  }

  const idx = schedule.slots.findIndex((s) => s.slotKey === params.slotKey);
  if (idx < 0)
    return {
      ok: false as const,
      code: 404 as const,
      message: "slot not found",
    };

  const slot = schedule.slots[idx]!;
  const nowIso = new Date().toISOString();
  if (params.restore) {
    slot.content = slot.generatedContent;
    slot.contentSource = "generated";
    delete slot.editedAt;
    delete slot.editedByUserId;
  } else {
    const next = (params.content ?? "").trim();
    if (!next)
      return {
        ok: false as const,
        code: 400 as const,
        message: "content is empty",
      };
    slot.content = next;
    slot.contentSource = "edited";
    slot.editedAt = nowIso;
    slot.editedByUserId = params.userId;
  }
  schedule.slots[idx] = slot;

  if (table === "plan") {
    await prisma.$executeRawUnsafe(
      'UPDATE "PlanVersion" SET schedule = $1::jsonb WHERE "planId" = $2 AND version = $3',
      JSON.stringify(schedule),
      params.planId,
      version,
    );
  } else {
    await prisma.$executeRawUnsafe(
      'UPDATE "PlanGenerationDraftVersion" SET schedule = $1::jsonb WHERE "draftId" = $2 AND version = $3',
      JSON.stringify(schedule),
      params.planId,
      version,
    );
  }

  return { ok: true as const, schedule, slot };
}
