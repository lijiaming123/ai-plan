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
import { getDefaultTimeZone, ymdInTimeZone } from "../../lib/reminder-tz";
import {
  resolveGranularityPlan,
  type GranularityMode,
  type SlotType,
} from "./granularity";
import {
  buildFallbackSchedule,
  deriveCheckinSpecFromSlotContent,
  extractLastJsonCodeBlock,
  parseScheduleWireOrNull,
  stripLastJsonCodeBlock,
  validateScheduleStrict,
  type CheckinSchedule,
} from "./deepseek-schedule";
import { listOpenScheduleSlotAppeals } from "./schedule-slot-appeal.service";
import { listScheduleSlotSubmissionsBySlot } from "./schedule-slot-checkin.service";

const editableFields = ["deadline", "note", "nextStep"] as const;

/** 下一步迭代方向：正文解析与用户编辑共用上限 */
export const MAX_NEXT_STEP_LEN = 2000;

export type ScheduleGranularity = "day" | "week";

/** PATCH /plans/:id 时仅允许白名单字段通过（其余忽略） */
export function sanitizePlanPatch(input: Record<string, unknown>) {
  const entries = Object.entries(input).filter(([key]) =>
    editableFields.includes(key as (typeof editableFields)[number]),
  );
  /** nextStep 仅保留字符串形态；其它类型丢弃该键避免误写入 */
  return Object.fromEntries(
    entries.filter(([key, val]) => {
      if (key !== "nextStep") return true;
      return typeof val === "string";
    }),
  );
}

/**
 * 从计划正文 Markdown 中提取「下一步迭代方向」小节的首段内容。
 * 匹配 ## / ### 标题「下一步迭代方向」，直到下一个同级别及以上标题为止。
 */
export function extractNextStepFromRequirement(markdown: string): string | null {
  const text = typeof markdown === "string" ? markdown.trim() : "";
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  let bodyStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{2,3}\s*下一步迭代方向\s*$/.test(lines[i].trim())) {
      bodyStart = i + 1;
      break;
    }
  }
  if (bodyStart < 0) return null;
  const buf: string[] = [];
  for (let j = bodyStart; j < lines.length; j++) {
    const line = lines[j];
    if (/^#{1,6}\s/.test(line)) break;
    buf.push(line);
  }
  const inner = buf.join("\n").trim();
  if (!inner) return null;
  return inner.length > MAX_NEXT_STEP_LEN
    ? inner.slice(0, MAX_NEXT_STEP_LEN)
    : inner;
}

/** PATCH /plans/:id 允许的字段写入数据库（note/deadline 暂不映射列，仅占位兼容旧客户端） */
export async function patchConfirmedPlan(params: {
  planId: string;
  userId: string;
  patch: Record<string, unknown>;
}): Promise<
  | {
      ok: true;
      nextStep: string | null;
    }
  | { ok: false; code: 404 | 400; message: string }
> {
  const sanitized = sanitizePlanPatch(params.patch);
  const row = (await (prisma as any).plan.findFirst({
    where: { id: params.planId, userId: params.userId, deletedAt: null },
  })) as { nextStep?: string | null } | null;
  if (!row) return { ok: false, code: 404, message: "plan not found" };

  if (!("nextStep" in sanitized))
    return { ok: true, nextStep: row.nextStep ?? null };

  const raw = sanitized.nextStep as string;
  const trimmed = raw.trim();
  if (trimmed.length > MAX_NEXT_STEP_LEN) {
    return {
      ok: false,
      code: 400,
      message: `下一步迭代方向最多 ${MAX_NEXT_STEP_LEN} 字`,
    };
  }

  await (prisma as any).plan.update({
    where: { id: params.planId },
    data: { nextStep: trimmed.length ? trimmed : null },
  });

  return { ok: true, nextStep: trimmed.length ? trimmed : null };
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

/** 自然日 YYYY-MM-DD 上加减天数，用正午解析减少时区边界抖动 */
function addDaysYmd(ymd: string, deltaDays: number): string {
  const base = ymd.slice(0, 10);
  const d = toDateOnly(`${base}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return formatDayKey(d);
}

export type CheckinListSegment = "done" | "missed" | "upcoming";

function extractOrderedSlotKeysFromSchedule(schedule: unknown): string[] {
  if (!schedule || typeof schedule !== "object") return [];
  const slots = (schedule as { slots?: unknown }).slots;
  if (!Array.isArray(slots)) return [];
  const keys: string[] = [];
  for (const item of slots) {
    if (
      item &&
      typeof item === "object" &&
      typeof (item as { slotKey?: unknown }).slotKey === "string"
    ) {
      const k = String((item as { slotKey: string }).slotKey).trim();
      if (k) keys.push(k);
    }
  }
  return keys;
}

/**
 * 列表卡片多段环：按 schedule.slots 顺序，结合今日与提交态得到每段颜色语义。
 * - done：已提交
 * - missed：该段日历上已应完成但未提交
 * - upcoming：尚未到达该段
 */
export function buildCheckinListSegments(params: {
  todayKey: string;
  granularity: "day" | "week";
  startDateYmd: string;
  slotKeysInOrder: string[];
  submittedSlotKeys: Set<string>;
}): CheckinListSegment[] {
  const {
    todayKey,
    granularity,
    startDateYmd,
    slotKeysInOrder,
    submittedSlotKeys,
  } = params;
  const startYmd = startDateYmd.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startYmd)) return [];

  const parseWeekIndex = (sk: string): number => {
    const m = /^W(\d+)$/i.exec(sk.trim());
    if (!m) return NaN;
    const n = Number(m[1]);
    return Number.isFinite(n) && n >= 1 ? n : NaN;
  };

  return slotKeysInOrder.map((rawKey) => {
    const slotKey = rawKey.trim();
    const submitted = submittedSlotKeys.has(slotKey);

    if (granularity === "week") {
      const k = parseWeekIndex(slotKey);
      if (!Number.isFinite(k)) return "upcoming";
      const weekStart = addDaysYmd(startYmd, (k - 1) * 7);
      const weekEnd = addDaysYmd(startYmd, (k - 1) * 7 + 6);
      if (todayKey < weekStart) return "upcoming";
      if (submitted) return "done";
      if (todayKey > weekEnd) return "missed";
      return "missed";
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(slotKey)) return "upcoming";
    if (todayKey < slotKey) return "upcoming";
    if (submitted) return "done";
    return "missed";
  });
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

function attachScheduleMeta(
  schedule: CheckinSchedule,
  meta: { startDate: string; endDate: string },
): CheckinSchedule {
  schedule.meta = { startDate: meta.startDate, endDate: meta.endDate };
  return schedule;
}

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
  currentVersion: true,
  confirmedVersion: true,
  userId: true,
} as const;

function mapPlanListRow(row: {
  id: string;
  goal: string;
  deadline: Date;
  requirement: string;
  type: string;
  createdAt: Date;
  completed?: boolean;
  startDateIso?: string | null;
  todayMissing?: boolean;
  checkinSegments?: CheckinListSegment[];
  checkinProgressPercent?: number;
}) {
  const base = {
    id: row.id,
    goal: row.goal,
    deadline: row.deadline.toISOString(),
    requirement: row.requirement,
    type: row.type,
    status: "active",
    createdAt: row.createdAt.toISOString(),
    completed: row.completed === true,
    startDate: row.startDateIso ?? null,
    todayMissing: row.todayMissing === true,
  };
  if (
    row.checkinSegments &&
    row.checkinSegments.length > 0 &&
    typeof row.checkinProgressPercent === "number"
  ) {
    return {
      ...base,
      checkinSegments: row.checkinSegments,
      checkinProgressPercent: row.checkinProgressPercent,
    };
  }
  return base;
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
    where: { userId, deletedAt: null, archivedAt: null },
    orderBy,
    select: planListSelect,
  });
  if (rows.length === 0) return [];

  // 批量计算 completed（所有槽位都有提交）。使用单条 SQL 聚合避免 N+1：
  // - slotCount: PlanVersion.schedule.slots 数组长度
  // - submittedSlots: distinct slotKey 提交数量
  const ids = rows.map((r) => r.id);
  const stats = (await prisma.$queryRawUnsafe(
    `
    SELECT
      p.id AS "planId",
      COALESCE(jsonb_array_length(pv.schedule->'slots'), 0) AS "slotCount",
      COALESCE(COUNT(DISTINCT s."slotKey"), 0) AS "submittedCount",
      pv.schedule->>'granularity' AS "granularity",
      pv.schedule->'meta'->>'startDate' AS "startDateIso",
      pv.schedule AS "schedule"
    FROM "Plan" p
    LEFT JOIN "PlanVersion" pv
      ON pv."planId" = p.id
     AND pv.version = COALESCE(p."confirmedVersion", p."currentVersion", 1)
    LEFT JOIN "PlanScheduleSlotSubmission" s
      ON s."planId" = p.id
     AND s."userId" = p."userId"
     AND s."closedAt" IS NULL
    WHERE p.id = ANY($1)
    GROUP BY p.id, pv.schedule
    `,
    ids,
  )) as Array<{
    planId: string;
    slotCount: number;
    submittedCount: number;
    granularity: string | null;
    startDateIso: string | null;
    schedule: unknown | null;
  }>;
  const byId = new Map<
    string,
    {
      slotCount: number;
      submittedCount: number;
      granularity: string | null;
      startDateIso: string | null;
      schedule: unknown | null;
    }
  >();
  for (const r of stats)
    byId.set(r.planId, {
      slotCount: r.slotCount,
      submittedCount: r.submittedCount,
      granularity: r.granularity,
      startDateIso: r.startDateIso,
      schedule: r.schedule,
    });

  const openSlotRows = (await prisma.$queryRawUnsafe(
    `
    SELECT DISTINCT s."planId" AS "planId", s."slotKey" AS "slotKey"
    FROM "PlanScheduleSlotSubmission" s
    WHERE s."planId" = ANY($1::text[])
      AND s."userId" = $2
      AND s."closedAt" IS NULL
    `,
    ids,
    userId,
  )) as Array<{ planId: string; slotKey: string }>;
  const submittedSlotsByPlan = new Map<string, Set<string>>();
  for (const r of openSlotRows) {
    const sk = String(r.slotKey ?? "").trim();
    if (!sk) continue;
    let set = submittedSlotsByPlan.get(r.planId);
    if (!set) {
      set = new Set<string>();
      submittedSlotsByPlan.set(r.planId, set);
    }
    set.add(sk);
  }

  const tz = getDefaultTimeZone();
  const todayKey = ymdInTimeZone(new Date(), tz);
  const pairs: Array<{ planId: string; slotKey: string }> = [];

  const base = rows.map((row) => {
    const st = byId.get(row.id);
    const completed =
      st != null && st.slotCount > 0 && st.submittedCount >= st.slotCount;
    const startDateIso = st?.startDateIso ?? row.createdAt.toISOString();

    if (!completed) {
      const start = toDateOnly(startDateIso);
      const end = toDateOnly(row.deadline.toISOString());
      const today = toDateOnly(todayKey);
      const durationDays = daysBetweenInclusive(start, end);
      const isInRange = today >= start && today <= end;
      if (isInRange && st?.slotCount && st.slotCount > 0) {
        const granularity = (st.granularity ?? "day").toLowerCase();
        if (granularity === "week") {
          const dayIndex = Math.max(0, daysBetweenInclusive(start, today) - 1);
          const weekIndex = Math.max(1, Math.floor(dayIndex / 7) + 1);
          const maxWeeks = Math.max(1, Math.ceil(durationDays / 7));
          if (weekIndex <= maxWeeks) {
            pairs.push({ planId: row.id, slotKey: `W${weekIndex}` });
          }
        } else {
          // day granularity
          pairs.push({ planId: row.id, slotKey: todayKey });
        }
      }
    }

    return { row, completed, startDateIso };
  });

  const todaySubmittedByPair = new Map<string, boolean>();
  if (pairs.length > 0) {
    const planIds = pairs.map((p) => p.planId);
    const slotKeys = pairs.map((p) => p.slotKey);
    const submitted = (await prisma.$queryRawUnsafe(
      `
      SELECT
        v."planId" AS "planId",
        v."slotKey" AS "slotKey",
        COALESCE(COUNT(s.id), 0) > 0 AS "submitted"
      FROM unnest($1::text[], $2::text[]) AS v("planId", "slotKey")
      LEFT JOIN "PlanScheduleSlotSubmission" s
        ON s."planId" = v."planId"
       AND s."slotKey" = v."slotKey"
       AND s."userId" = $3
       AND s."closedAt" IS NULL
      GROUP BY v."planId", v."slotKey"
      `,
      planIds,
      slotKeys,
      userId,
    )) as Array<{ planId: string; slotKey: string; submitted: boolean }>;
    for (const r of submitted) {
      todaySubmittedByPair.set(`${r.planId}::${r.slotKey}`, r.submitted === true);
    }
  }

  return base.map((b) => {
    const { row, completed, startDateIso } = b;
    const st = byId.get(row.id);
    let todayMissing = false;
    if (!completed) {
      const start = toDateOnly(startDateIso);
      const end = toDateOnly(row.deadline.toISOString());
      const today = toDateOnly(todayKey);
      const isInRange = today >= start && today <= end;
      if (isInRange && st?.slotCount && st.slotCount > 0) {
        const granularity = (st.granularity ?? "day").toLowerCase();
        const slotKey =
          granularity === "week"
            ? (() => {
                const dayIndex = Math.max(
                  0,
                  daysBetweenInclusive(start, today) - 1,
                );
                const weekIndex = Math.max(1, Math.floor(dayIndex / 7) + 1);
                return `W${weekIndex}`;
              })()
            : todayKey;
        const submitted = todaySubmittedByPair.get(`${row.id}::${slotKey}`);
        todayMissing = submitted === false;
      }
    }

    const slotKeys = extractOrderedSlotKeysFromSchedule(st?.schedule);
    let checkinSegments: CheckinListSegment[] | undefined;
    let checkinProgressPercent: number | undefined;
    if (slotKeys.length > 0) {
      const granularity =
        (st?.granularity ?? "day").toLowerCase() === "week" ? "week" : "day";
      const startYmd = (startDateIso ?? row.createdAt.toISOString()).slice(
        0,
        10,
      );
      const submittedSet = submittedSlotsByPlan.get(row.id) ?? new Set();
      const segs = buildCheckinListSegments({
        todayKey,
        granularity,
        startDateYmd: startYmd,
        slotKeysInOrder: slotKeys,
        submittedSlotKeys: submittedSet,
      });
      if (segs.length > 0) {
        checkinSegments = segs;
        const doneN = segs.filter((x) => x === "done").length;
        checkinProgressPercent = Math.round((100 * doneN) / segs.length);
      }
    }

    return mapPlanListRow({
      ...row,
      completed,
      startDateIso,
      todayMissing,
      checkinSegments,
      checkinProgressPercent,
    });
  });
}

/** 归档列表：已归档且未进回收站；支持分页与按目标模糊搜索 */
export async function listArchivedPlansForUser(
  userId: string,
  options?: {
    sort?: PlanListSort;
    limit?: number;
    offset?: number;
    search?: string;
  },
): Promise<{
  plans: Array<
    Omit<ReturnType<typeof mapPlanListRow>, "status"> & {
      status: "archived";
      archivedAt: string;
    }
  >;
  hasMore: boolean;
}> {
  const sort: PlanListSort = options?.sort ?? "created_desc";
  const orderBy =
    sort === "deadline_asc"
      ? ({ deadline: "asc" } as const)
      : ({ archivedAt: "desc" } as const);

  const limitRaw = options?.limit ?? 20;
  const limit = Math.min(50, Math.max(1, limitRaw));
  const offset = Math.max(0, options?.offset ?? 0);

  const rawSearch = options?.search?.trim();
  const search =
    rawSearch && rawSearch.length > 0 ? rawSearch.slice(0, 120) : undefined;

  const rows = await prisma.plan.findMany({
    where: {
      userId,
      deletedAt: null,
      archivedAt: { not: null },
      ...(search
        ? { goal: { contains: search, mode: "insensitive" as const } }
        : {}),
    },
    orderBy,
    skip: offset,
    take: limit + 1,
    select: { ...planListSelect, archivedAt: true },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    plans: page.map((row) => ({
      ...mapPlanListRow(row),
      status: "archived" as const,
      archivedAt: row.archivedAt!.toISOString(),
    })),
    hasMore,
  };
}

export async function archivePlan(params: {
  planId: string;
  userId: string;
}): Promise<
  | { ok: true }
  | { ok: false; code: 404 | 403 | 400; message: string }
> {
  const row = await prisma.plan.findUnique({
    where: { id: params.planId },
    select: { userId: true, deletedAt: true, archivedAt: true },
  });
  if (!row) return { ok: false, code: 404, message: "plan not found" };
  if (row.userId !== params.userId)
    return { ok: false, code: 403, message: "Forbidden" };
  if (row.deletedAt)
    return {
      ok: false,
      code: 400,
      message: "无法归档已删除的计划，请先从最近删除中恢复",
    };
  if (row.archivedAt) return { ok: true };
  await prisma.plan.update({
    where: { id: params.planId },
    data: { archivedAt: new Date() },
  });
  return { ok: true };
}

export async function unarchivePlan(params: {
  planId: string;
  userId: string;
}): Promise<
  | { ok: true }
  | { ok: false; code: 404 | 403 | 400; message: string }
> {
  const row = await prisma.plan.findUnique({
    where: { id: params.planId },
    select: { userId: true, deletedAt: true, archivedAt: true },
  });
  if (!row) return { ok: false, code: 404, message: "plan not found" };
  if (row.userId !== params.userId)
    return { ok: false, code: 403, message: "Forbidden" };
  if (row.deletedAt)
    return {
      ok: false,
      code: 400,
      message: "无法恢复执行：计划仍在回收站，请先撤销删除",
    };
  if (!row.archivedAt)
    return { ok: false, code: 400, message: "plan is not archived" };
  await prisma.plan.update({
    where: { id: params.planId },
    data: { archivedAt: null },
  });
  return { ok: true };
}

export async function listTrashPlans(userId: string) {
  const rows = await prisma.plan.findMany({
    where: { userId, deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    select: { ...planListSelect, deletedAt: true },
  });
  return rows.map((row) => ({
    ...mapPlanListRow(row),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  }));
}

export async function softDeletePlan(params: {
  planId: string;
  userId: string;
}): Promise<
  | { ok: true }
  | { ok: false; code: 404 | 403; message: string }
> {
  const row = await prisma.plan.findUnique({
    where: { id: params.planId },
    select: { userId: true },
  });
  if (!row) return { ok: false, code: 404, message: "plan not found" };
  if (row.userId !== params.userId)
    return { ok: false, code: 403, message: "Forbidden" };

  await prisma.plan.update({
    where: { id: params.planId },
    data: { deletedAt: new Date() },
  });
  return { ok: true };
}

export async function restorePlan(params: {
  planId: string;
  userId: string;
}): Promise<
  | { ok: true }
  | { ok: false; code: 404 | 403; message: string }
> {
  const row = await prisma.plan.findUnique({
    where: { id: params.planId },
    select: { userId: true },
  });
  if (!row) return { ok: false, code: 404, message: "plan not found" };
  if (row.userId !== params.userId)
    return { ok: false, code: 403, message: "Forbidden" };

  await prisma.plan.update({
    where: { id: params.planId },
    data: { deletedAt: null },
  });
  return { ok: true };
}

/** 用户维度的计划详情 + 草稿元数据（版本列表、是否还可 regenerate） */
export async function getPlanWithDraft(planId: string, userId: string) {
  const plan = (await (prisma as any).plan.findFirst({
    where: { id: planId, userId, deletedAt: null },
  })) as (Record<string, unknown> & { parentPlanId?: string | null }) | null;
  if (!plan) return null;
  let parentPlan: { id: string; goal: string } | null = null;
  if (plan.parentPlanId) {
    const row = await prisma.plan.findFirst({
      where: {
        id: plan.parentPlanId,
        userId,
        deletedAt: null,
      },
      select: { id: true, goal: true },
    });
    parentPlan = row;
  }
  const childPlans = await (prisma as any).plan.findMany({
    where: {
      parentPlanId: plan.id,
      userId,
      deletedAt: null,
    },
    select: { id: true, goal: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const state = await loadPersistedPlanState(plan as any);
  const scheduleSlotSubmissions = await listScheduleSlotSubmissionsBySlot(
    planId,
    userId,
  );
  const scheduleSlotOpenAppeals = await listOpenScheduleSlotAppeals(
    planId,
    userId,
  );
  return {
    ...plan,
    status: plan.archivedAt ? "archived" : "active",
    parentPlan,
    childPlans,
    draft: {
      versions: state.versions,
      maxVersions: state.maxVersions,
      confirmedVersion: state.confirmedVersion,
      canRegenerate:
        state.versions.length < state.maxVersions &&
        state.confirmedVersion === null,
    },
    scheduleSlotSubmissions,
    scheduleSlotOpenAppeals,
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

export const REGENERATE_PLAN_SYSTEM_TRAVEL =
  "你是「旅行行程规划师」。根据用户给出的信息与要求，用中文输出可直接作为「行程攻略/行程安排」保存的正文：按天/按时段给出路线顺序、交通方式与通勤时长、预约/门票/营业时间提醒、备选方案与注意事项。不要用“完成任务/提交证明/产出”这类学习计划语气，也不要输出与行程无关的寒暄。";

export const REGENERATE_PLAN_SYSTEM_GENERAL =
  "你是「轻量行动清单教练」。根据用户给出的信息与要求，用中文输出可直接作为「行动清单/习惯计划」保存的正文：强调最小可执行动作、简单规则与复盘，不要要求上传证明/材料；完成方式默认是“勾选完成”，可选写一句备注。不要输出与清单无关的寒暄。";

const TRAVEL_SCHEDULE_INSTRUCTIONS = [
  "【行程化输出要求（仅适用于旅游/旅行类计划）】",
  "你正在生成的是“行程安排”，不是学习计划。每个 schedule slot.content 必须同时包含以下要素：",
  "1) 早/午/晚（或上午/下午/晚上）的路线顺序（地点/景点/餐饮/休息点按先后排列）；",
  "2) 交通方式 + 预计通勤时长（如地铁/公交/打车/步行/高铁/航班）；",
  "3) 预约/门票/营业时间/入园与排队等提醒（如需提前预约、建议到达时间）；",
  "4) 备选方案（如下雨/人多/临时关闭时替代点位或改线）；",
  "5) 可选记录建议（如拍照点/一句话记录/当日小结）。",
  "风格：攻略/行程规划，务实可执行；避免“完成任务/提交证明/学习产出/打卡证据”等措辞。",
].join("\n");

const GENERAL_SCHEDULE_INSTRUCTIONS = [
  "【轻量清单输出要求（仅适用于其它/通用/checkbox-only 计划）】",
  "你正在生成的是“轻量行动清单/习惯计划”，不是学习计划也不是旅行行程。",
  "每个 schedule slot.content 用 1-2 句中文描述“最小行动 + 可选加强动作（可省略）”。",
  "不要在 slot.content 或 checkinSpec 中要求上传证明/材料/附件/链接；默认完成方式是“勾选完成”，用户可选写一句备注。",
  "建议：避免过度规划，不要给太长的解释或方法论。",
].join("\n");

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

  const travelLike =
    (planType ?? "").toLowerCase() === "travel" ||
    /(行程|旅行|旅游|攻略|出行|路线|景点|酒店|民宿|航班|高铁|车次|地铁|公交|步行|打车|门票|预约|营业时间|开放时间)/i.test(
      baseRequirement ?? "",
    );
  const generalLike =
    !travelLike &&
    (planType ?? "").toLowerCase() === "general" &&
    /(其它|通用|清单|习惯|打卡|每日|最小行动)/i.test(baseRequirement ?? "");

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
    ...(travelLike
      ? ["", TRAVEL_SCHEDULE_INSTRUCTIONS]
      : generalLike
        ? ["", GENERAL_SCHEDULE_INSTRUCTIONS]
        : []),
    "",
    "请输出：",
    "1) 可直接保存为「计划内容」的中文正文；",
    "2) 在最后输出一个严格的 JSON 代码块（```json ...```），仅包含如下结构：",
    "{",
    '  "schedule": {',
    `    "granularity": "${expectedGranularity}",`,
    '    "slots": [',
    '      { "slotKey": "...", "content": "...", "checkinSpec": { "criteria": ["..."], "evidenceHint": "..." } }',
    "    ]",
    "  }",
    "}",
    travelLike
      ? "注意：slotKey 必须严格来自下方「时间槽」列表，且顺序必须完全一致；content 必须按“行程化输出要求”撰写（可执行、含路线/交通/提醒/备选/记录建议）。可选 checkinSpec：criteria 为 2-5 条当期提醒/清单短句，evidenceHint 可写“预约/携带物品/拍照点/注意事项”等备忘。"
      : generalLike
        ? "注意：slotKey 必须严格来自下方「时间槽」列表，且顺序必须完全一致；content 必须按“轻量清单输出要求”撰写；不要要求提交证明/材料。可选 checkinSpec：criteria 为 2-5 条自我提醒短句，evidenceHint 可写“勾选完成即可，可选备注”。"
        : "注意：slotKey 必须严格来自下方「时间槽」列表，且顺序必须完全一致；content 为当期计划一段中文（1-3句，具体可执行）。可选 checkinSpec：criteria 为 2-5 条可验收短句，evidenceHint 提示用户应提交何种证明（利于打卡核验）。",
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
      {
        role: "system",
        content:
          (params.planType ?? "").toLowerCase() === "travel"
            ? REGENERATE_PLAN_SYSTEM_TRAVEL
            : (params.planType ?? "").toLowerCase() === "general"
              ? REGENERATE_PLAN_SYSTEM_GENERAL
              : REGENERATE_PLAN_SYSTEM,
      },
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

    const parsedNext = extractNextStepFromRequirement(snapshot.requirement);

    await (tx as any).plan.create({
      data: {
        id: draftId,
        userId: draft.userId,
        goal: draft.goal,
        deadline: new Date(snapshot.deadline),
        requirement: snapshot.requirement,
        type: draft.type,
        nextStep: parsedNext,
        parentPlanId: (draft as any).parentPlanId ?? null,
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
    /** 可选：续航来源计划 id（须同用户且未删除） */
    parentPlanId?: string | null;
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
  attachScheduleMeta(schedule, { startDate: startDateIso, endDate: input.deadline });

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
    const createdDraft = await (tx as any).planGenerationDraft.create({
      data: {
        userId: input.userId,
        goal: input.goal,
        deadline: new Date(input.deadline),
        requirement: requirementText,
        type: input.type,
        parentPlanId: input.parentPlanId?.trim()
          ? input.parentPlanId.trim()
          : null,
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
  const MAX_SLOT_CONTENT_LEN = 2000;
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

  if (plan?.archivedAt) {
    return {
      ok: false as const,
      code: 403 as const,
      message: "已归档的计划不可编辑打卡表",
    };
  }

  // 规则：只要该 slot 曾经出现过“通过”的提交记录（即存在任意提交行），就禁止再编辑/恢复。
  // 当前实现中：只有核验通过或旅游勾选完成才会创建 active submission，因此 active 行等价于“当前已完成”。
  const hasPassedSubmission = await prisma.planScheduleSlotSubmission.findFirst({
    where: {
      planId: params.planId,
      slotKey: params.slotKey,
      userId: params.userId,
      closedAt: null,
    } as never,
    select: { id: true },
  });
  if (hasPassedSubmission) {
    return {
      ok: false as const,
      code: 409 as const,
      message: "该时间槽已通过核验，禁止再修改计划内容",
    };
  }

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
    slot.checkinSpec = deriveCheckinSpecFromSlotContent(slot.content);
  } else {
    const next = (params.content ?? "").trim();
    if (!next)
      return {
        ok: false as const,
        code: 400 as const,
        message: "计划内容不能为空",
      };
    if (next.length > MAX_SLOT_CONTENT_LEN) {
      return {
        ok: false as const,
        code: 400 as const,
        message: `计划内容过长（最多 ${MAX_SLOT_CONTENT_LEN} 字）`,
      };
    }
    slot.content = next;
    slot.contentSource = "edited";
    slot.editedAt = nowIso;
    slot.editedByUserId = params.userId;
    slot.checkinSpec = deriveCheckinSpecFromSlotContent(slot.content);
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

export async function swapPlanScheduleSlotContent(params: {
  planId: string;
  userId: string;
  slotKeyA: string;
  slotKeyB: string;
  /** 生成草稿多版本：指定 PlanGenerationDraftVersion.version */
  planVersion?: number;
}) {
  if (
    params.planVersion != null &&
    (!Number.isInteger(params.planVersion) || params.planVersion < 1)
  ) {
    return {
      ok: false as const,
      code: 400 as const,
      message: "version must be a positive integer",
    };
  }

  const keyA = params.slotKeyA.trim();
  const keyB = params.slotKeyB.trim();
  if (!keyA || !keyB) {
    return {
      ok: false as const,
      code: 400 as const,
      message: "slot keys are required",
    };
  }
  if (keyA === keyB) {
    return {
      ok: false as const,
      code: 400 as const,
      message: "slot keys must be different",
    };
  }

  const hasPassedAnySubmission = await prisma.planScheduleSlotSubmission.findFirst({
    where: {
      planId: params.planId,
      userId: params.userId,
      slotKey: { in: [keyA, keyB] },
      closedAt: null,
    } as never,
    select: { id: true },
  });
  if (hasPassedAnySubmission) {
    return {
      ok: false as const,
      code: 409 as const,
      message: "包含已通过核验的时间槽，禁止修改计划内容",
    };
  }

  const plan = await prisma.plan.findFirst({
    where: { id: params.planId, userId: params.userId },
  });

  const draft =
    plan == null
      ? await prisma.planGenerationDraft.findFirst({
          where: { id: params.planId, userId: params.userId },
        })
      : null;

  if (!plan && !draft) {
    return {
      ok: false as const,
      code: 404 as const,
      message: "plan not found",
    };
  }

  if (plan?.archivedAt) {
    return {
      ok: false as const,
      code: 403 as const,
      message: "已归档的计划不可交换槽位内容",
    };
  }

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

  const idxA = schedule.slots.findIndex((s) => s.slotKey === keyA);
  const idxB = schedule.slots.findIndex((s) => s.slotKey === keyB);
  if (idxA < 0 || idxB < 0) {
    return {
      ok: false as const,
      code: 404 as const,
      message: "slot not found",
    };
  }

  const slotA = schedule.slots[idxA]!;
  const slotB = schedule.slots[idxB]!;
  const swappedContentA = slotB.content;
  const swappedContentB = slotA.content;
  const nowIso = new Date().toISOString();

  slotA.content = swappedContentA;
  slotA.contentSource = "edited";
  slotA.editedAt = nowIso;
  slotA.editedByUserId = params.userId;
  slotA.checkinSpec = deriveCheckinSpecFromSlotContent(slotA.content);

  slotB.content = swappedContentB;
  slotB.contentSource = "edited";
  slotB.editedAt = nowIso;
  slotB.editedByUserId = params.userId;
  slotB.checkinSpec = deriveCheckinSpecFromSlotContent(slotB.content);

  schedule.slots[idxA] = slotA;
  schedule.slots[idxB] = slotB;

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

  return {
    ok: true as const,
    schedule,
    slots: {
      slotA: schedule.slots[idxA],
      slotB: schedule.slots[idxB],
    },
  };
}
