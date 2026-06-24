export type CreatePlanInput = {
  goal: string;
  deadline: string;
  requirement: string;
  type: "general" | "study" | "work" | "travel";
  token: string;
  /** 续航：来源已定稿计划 id */
  parentPlanId?: string;
  profile?: {
    planMode: "basic" | "pro";
    basicInfo: {
      planScenario: "study" | "travel" | "other";
      planName: string;
      planContent: string;
      currentLevel: "none" | "newbie" | "junior" | "intermediate" | "advanced";
      startingPoint?:
        | ""
        | "none"
        | "newbie"
        | "junior"
        | "intermediate"
        | "advanced";
      startDate: string;
      cycle: "1w" | "1m" | "3m" | "6m" | "custom";
      endDate: string;
      preference: string;
      focusAreas?: string[];
      timeInvestment: string;
      timeInvestmentCustomHours?: number;
      granularityMode?: "smart" | "deep" | "rough";
    };
    proSettings?: {
      aiDepth: "basic" | "advanced";
      reminderMode: "standard" | "smart";
    };
  };
};

export type CreateSubmissionInput = {
  taskId: string;
  content: string;
  imageUrls: string[];
  token: string;
};

export type PlanAssistantInput = {
  token: string;
  mode: "draft" | "chat";
  goal: string;
  requirement: string;
  startDate: string;
  cycle: "1w" | "1m" | "3m" | "6m" | "custom";
  endDate: string;
  granularityMode?: "smart" | "deep" | "rough";
  message?: string;
  tier?: "basic" | "pro";
  agent?: "basic" | "pro";
};

export type PlanAssistantResult = {
  reply: string;
  suggestedContent: string;
  schedule?: {
    granularity: "day" | "week";
    meta?: { startDate: string; endDate: string };
    slots: Array<{
      slotKey: string;
      generatedContent: string;
      content: string;
      contentSource: "generated" | "edited";
      editedAt?: string;
      editedByUserId?: string;
    }>;
  };
  meta?: {
    usedAgent?: "basic" | "pro";
    score?: number;
    scoreBreakdown?: Record<string, number>;
    issues?: Array<{
      code: string;
      severity: string;
      title: string;
      detail: string;
      suggestion: string;
    }>;
    options?: Array<{
      id: string;
      title: string;
      pros: string[];
      cons: string[];
    }>;
    diffSummary?: string[];
    assumptions?: string[];
  };
};

export type PlanAssistantApplyOptionInput = {
  token: string;
  baseSuggestedContent: string;
  baseSchedule: {
    granularity: "day" | "week";
    meta?: { startDate: string; endDate: string };
    slots: Array<{ slotKey: string; content: string }>;
  };
  optionId?: "more_granular" | "save_time" | "more_steady" | "more_aggressive";
  customText?: string;
  context: {
    goal: string;
    startDate: string;
    endDate: string;
    cycle: "1w" | "1m" | "3m" | "6m" | "custom";
    type: "general" | "study" | "work" | "travel";
  };
};

export type PlanAssistantApplyOptionResult = {
  suggestedContent: string;
  schedule: {
    granularity: "day" | "week";
    meta?: { startDate: string; endDate: string };
    slots: Array<{ slotKey: string; content: string }>;
  };
  meta?: { diffSummary?: string[] };
};

export type ParsePlanFileInput = {
  token: string;
  fileName: string;
  contentBase64: string;
};

export type ParsePlanFileResult = {
  text: string;
};

/** 列表卡片多段进度环：每段对应 schedule 中一个 slot 的语义色 */
export type CheckinListSegment = "done" | "missed" | "upcoming";

/** GET /plans 列表项（仅已定稿 Plan；生成中数据在 PlanGenerationDraft 表，不经列表暴露） */
export type PlanListRow = {
  id: string;
  goal: string;
  deadline: string;
  requirement: string;
  type: string;
  status: string;
  createdAt: string;
  /** 计划开始日期（ISO）；用于计算“未开始” */
  startDate?: string | null;
  /** 是否所有打卡段都已提交（不受日期是否到达影响） */
  completed?: boolean;
  /** 执行中：今天应打卡但未提交（用于列表页红色提醒） */
  todayMissing?: boolean;
  /** 有打卡表时：各 slot 按顺序的完成态（用于多段环） */
  checkinSegments?: CheckinListSegment[];
  /** 与 checkinSegments 同步：已提交段数 / 总段数 ×100 */
  checkinProgressPercent?: number;
};

export type DeletedPlanListRow = {
  id: string;
  goal: string;
  deadline: string;
  requirement: string;
  type: string;
  createdAt: string;
  deletedAt: string | null;
};

/** GET /plans/archive：已归档且未删除 */
export type ArchivedPlanListRow = PlanListRow & {
  archivedAt: string;
};

export type PlanRecord = {
  id: string;
  userId?: string;
  goal: string;
  deadline: string;
  requirement: string;
  type: string;
  status?: string;
  /** 已定稿计划归档时间（ISO）；未归档为 null */
  archivedAt?: string | null;
  /** 下一步迭代方向（可 PATCH 更新；定稿时也会从正文解析） */
  nextStep?: string | null;
  /** 续航父计划 id */
  parentPlanId?: string | null;
  /** 父计划摘要（同用户下存在时返回，便于展示「承接自」） */
  parentPlan?: { id: string; goal: string } | null;
  /** 由此计划「续航」创建的子计划列表（按创建时间升序；可多条） */
  childPlans?: Array<{ id: string; goal: string; createdAt: string }>;
  draft?: {
    versions: Array<{
      version: number;
      requirement: string;
      deadline: string;
      createdAt: string;
      schedule?: {
        granularity: "day" | "week";
        meta?: { startDate: string; endDate: string };
        slots: Array<{
          slotKey: string;
          generatedContent: string;
          content: string;
          contentSource: "generated" | "edited";
          editedAt?: string;
          editedByUserId?: string;
          checkinSpec?: { criteria: string[]; evidenceHint?: string };
        }>;
      };
      stages: Array<{
        name: string;
        sortOrder: number;
        tasks: Array<{
          id: string;
          title: string;
          order: number;
          timeSlotType?: "day" | "week" | "month";
          timeSlotKey?: string;
          taskType?: "action" | "weekly_summary" | "monthly_summary";
        }>;
      }>;
    }>;
    maxVersions: number;
    confirmedVersion: number | null;
    canRegenerate: boolean;
  } | null;
  /** 已定稿计划：各打卡槽的提交记录（GET /plans/:id） */
  scheduleSlotSubmissions?: Record<string, ScheduleSlotCheckinRecord[]>;
  /** 各打卡段进行中的申诉（open）；无键表示该段无待处理申诉 */
  scheduleSlotOpenAppeals?: Record<
    string,
    { id: string; content: string; createdAt: string }
  >;
};

/** GET /plans/:id/draft：生成中会话（含主档字段 + 版本树） */
export type PlanDraftSessionPayload = {
  goal: string;
  deadline: string;
  type: string;
  requirement: string;
} & NonNullable<PlanRecord["draft"]>;

export type SubmissionImage = {
  id: string;
  url: string;
  hash: string;
};

export type SubmissionRecord = {
  id: string;
  content: string;
  status: string;
  images: SubmissionImage[];
};

export type ScheduleSlotCheckinAttachment = {
  id: string;
  url: string;
  fileName: string | null;
  kind: string;
  hash: string;
  createdAt: string;
};

export type ScheduleSlotCheckinRecord = {
  id: string;
  content: string;
  status: string;
  createdAt: string;
  attachments: ScheduleSlotCheckinAttachment[];
};

/** 打卡核验未通过时，422 body.review（对外仅档位+提示，不含精确分） */
export type CheckinReviewBand = "low" | "mid" | "high";
export type CheckinReviewDimension = {
  id: string;
  label: string;
  band: CheckinReviewBand;
  hint: string;
};
export type CheckinPublicReview = {
  passed: boolean;
  dimensions: CheckinReviewDimension[];
  summary: string;
};

/** POST .../appeals：先 AI 预审，通过则自动建档 */
export type SlotAppealResponse = {
  appeal: { id: string; content: string; createdAt: string };
  outcome: "ai_approved" | "human_review";
  aiRationale: string;
  submission?: ScheduleSlotCheckinRecord;
};
