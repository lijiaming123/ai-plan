import {
  formatApiErrorForUser,
  formatHttpApiUserMessage,
} from "./api-error-message";

export type ApiClientOptions = {
  baseURL?: string;
  fetchImpl?: typeof fetch;
};

/** 用户端：`phone` + `password`；管理端/演示：`email` + `password` */
export type LoginInput =
  | { phone: string; password: string; email?: undefined }
  | { email: string; password: string; phone?: undefined };

export type OtpPurpose = "login" | "register" | "reset";

export type OtpSendResponse =
  | {
      ok: true;
      phone: string;
      purpose: OtpPurpose;
      expiresInSeconds: number;
      cooldownSeconds: number;
      codeForTest?: string;
    }
  | { message: string; cooldownSeconds?: number };

export type AiQuotaSnapshot = {
  used: number;
  limit: number;
  yearMonth: string;
};

export type PlanTierApi = "basic" | "pro";

export type OtpVerifyResponse = {
  token: string;
  phone: string;
  userId: string;
  planTier?: PlanTierApi;
  proExpiresAt?: string | null;
  aiQuota?: AiQuotaSnapshot | null;
};

export type AuthMeResponse = {
  userId: string;
  email: string;
  role: "user" | "admin";
  permissions?: string[];
  planTier?: PlanTierApi;
  proExpiresAt?: string | null;
  aiQuota?: AiQuotaSnapshot | null;
};

export type PlanHeatmapDay = {
  date: string;
  status: "completed" | "missed" | "pending" | "none";
  summary?: { due: number; done: number };
};

export type PlanHeatmapResponse = {
  year: number;
  timeZone: string;
  days: PlanHeatmapDay[];
};

/** GET /me/insights */
export type UserInsightsResponse = {
  activePlans: number;
  weekCheckinsCompleted: number;
  avgProgressPercent: number;
  weeklyCheckinTrend: number[];
  weekRangeLabel: string;
};

/** GET /me/plan-assistant-context、PATCH /me/plan-assistant-profile */
export type PlanAssistantProfileApi = {
  tone: string | null;
  language: string | null;
  weeklyHoursCap: number | null;
  preferMorning: boolean | null;
  evidenceTolerance: string | null;
  defaultScenario: string | null;
  pinnedNotes: string[];
};

export type PlanAssistantContextResponse = {
  profile: PlanAssistantProfileApi;
  completionSummary: string;
  quotaHint: AiQuotaSnapshot | null;
};

export type PlanAssistantProfilePatchInput = {
  token: string;
  tone?: "concise" | "detailed" | null;
  language?: "zh" | null;
  weeklyHoursCap?: number | null;
  preferMorning?: boolean | null;
  evidenceTolerance?: "low" | "medium" | null;
  defaultScenario?: "study" | "work" | "travel" | "general" | null;
  pinnedNotes?: string[];
};

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

export type PresetTemplateBrief = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  coverImageUrl: string | null;
  category: string;
  tags: string[];
  locale: string;
  sortOrder: number;
};

export type MarketTemplateBrief = {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  likeCount: number;
  applicationCount: number;
  publishedAt: string | null;
  /** 作者侧管理与审核状态（created scope 可能返回；市场列表通常为 published） */
  status?: string;
  rejectedAt?: string | null;
  rejectReasonCode?: string | null;
  rejectNote?: string | null;
  /** 登录访问市场列表时由后端返回 */
  favorited?: boolean;
  likedByMe?: boolean;
};

export type MarketTemplatePreview = {
  goal: string;
  deadline: string;
  requirementExcerpt: string;
  type: string;
  granularityMode: string | null;
  startDateIso: string | null;
  versionId: string;
  version: number;
  payloadHash: string;
};

export type MarketTemplateDetail = MarketTemplateBrief & {
  preview: MarketTemplatePreview;
};

export type MarketListResult = {
  items: MarketTemplateBrief[];
  page: number;
  pageSize: number;
  total: number;
};

export type PublishMarketTemplateInput = {
  token: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  planId?: string;
  payload?: Record<string, unknown>;
};

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

export type InAppNotificationItem = {
  id: string;
  userId: string;
  type: string;
  planId: string;
  slotKey: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPreferences = {
  timeZone: string;
  remindAt: string;
  pendingRemindAt: string | null;
  switchAt: string | null;
};

export type ForgotPasswordResponse = {
  ok: true;
  mode?: string;
  message: string;
};

export type CaptchaSessionResponse = {
  captchaId: string;
  imageSvg: string;
};

export type ApiClient = {
  /** 用户端传 `phone`；管理端传 `email`。 */
  login(input: LoginInput): Promise<{
    token: string;
    planTier?: PlanTierApi;
    proExpiresAt?: string | null;
    aiQuota?: AiQuotaSnapshot | null;
  }>;
  forgotPassword(input: { email: string }): Promise<ForgotPasswordResponse>;
  getCaptcha(): Promise<CaptchaSessionResponse>;
  sendOtp(input: {
    phone: string;
    purpose?: OtpPurpose;
    captchaId: string;
    captchaText: string;
  }): Promise<OtpSendResponse>;
  verifyOtp(input: {
    phone: string;
    code: string;
    purpose?: OtpPurpose;
    password?: string;
    passwordConfirm?: string;
  }): Promise<OtpVerifyResponse>;
  getAuthMe(input: { token: string }): Promise<AuthMeResponse>;
  getPlanHeatmap(input: {
    token: string;
    year?: number;
  }): Promise<PlanHeatmapResponse>;
  getUserInsights(input: { token: string }): Promise<UserInsightsResponse>;
  getPlanAssistantContext(input: {
    token: string;
  }): Promise<PlanAssistantContextResponse>;
  patchPlanAssistantProfile(
    input: PlanAssistantProfilePatchInput,
  ): Promise<PlanAssistantContextResponse>;
  postPlanAssistantPinNote(input: {
    token: string;
    text: string;
  }): Promise<PlanAssistantContextResponse>;
  listNotifications(input: {
    token: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ items: InAppNotificationItem[]; nextCursor: string | null }>;
  getNotificationsUnreadCount(input: {
    token: string;
  }): Promise<{ unreadCount: number }>;
  patchNotificationRead(input: { token: string; id: string }): Promise<{ ok: true }>;
  postNotificationsReadAll(input: { token: string }): Promise<{ ok: true }>;
  getNotificationPreferences(input: {
    token: string;
  }): Promise<NotificationPreferences>;
  patchNotificationPreferences(input: {
    token: string;
    remindAt?: string;
    timeZone?: string;
  }): Promise<NotificationPreferences>;
  listPlans(input: {
    token: string;
    /** `deadline`：按截止日期升序（更近的在前）。默认按创建时间倒序。 */
    sort?: "created" | "deadline";
  }): Promise<{ plans: PlanListRow[] }>;
  deletePlan(input: { id: string; token: string }): Promise<{ ok: true }>;
  restorePlan(input: { id: string; token: string }): Promise<{ ok: true }>;
  listDeletedPlans(input: {
    token: string;
  }): Promise<{ plans: DeletedPlanListRow[] }>;
  listArchivedPlans(input: {
    token: string;
    sort?: "created" | "deadline";
    limit?: number;
    offset?: number;
    /** 按目标（goal）模糊匹配，服务端过滤 */
    search?: string;
  }): Promise<{ plans: ArchivedPlanListRow[]; hasMore: boolean }>;
  archivePlan(input: { id: string; token: string }): Promise<{ ok: true }>;
  unarchivePlan(input: { id: string; token: string }): Promise<{ ok: true }>;
  createPlan(input: CreatePlanInput): Promise<PlanRecord>;
  createSubmission(input: CreateSubmissionInput): Promise<SubmissionRecord>;
  planAssistant(input: PlanAssistantInput): Promise<PlanAssistantResult>;
  planAssistantApplyOption(
    input: PlanAssistantApplyOptionInput,
  ): Promise<PlanAssistantApplyOptionResult>;
  parsePlanFile(input: ParsePlanFileInput): Promise<ParsePlanFileResult>;
  getPlan(input: { id: string; token: string }): Promise<PlanRecord>;
  /** 更新已定稿计划的有限字段（当前支持 nextStep） */
  patchPlan(input: {
    id: string;
    token: string;
    nextStep?: string;
  }): Promise<{ nextStep: string | null }>;
  getPlanDraft(input: {
    id: string;
    token: string;
  }): Promise<PlanDraftSessionPayload>;
  patchPlanScheduleSlot(input: {
    id: string;
    slotKey: string;
    token: string;
    content?: string;
    restore?: boolean;
    /** 草稿多版本时指定 PlanVersion.version，避免误改 currentVersion 对应行 */
    version?: number;
  }): Promise<{
    schedule: NonNullable<
      NonNullable<PlanRecord["draft"]>["versions"][number]["schedule"]
    >;
    slot: NonNullable<
      NonNullable<PlanRecord["draft"]>["versions"][number]["schedule"]
    >["slots"][number];
  }>;
  postPlanScheduleSwapContent(input: {
    id: string;
    token: string;
    slotKeyA: string;
    slotKeyB: string;
    /** 草稿多版本时指定 PlanVersion.version，避免误改 currentVersion 对应行 */
    version?: number;
  }): Promise<{
    schedule: NonNullable<
      NonNullable<PlanRecord["draft"]>["versions"][number]["schedule"]
    >;
    slots: {
      slotA: NonNullable<
        NonNullable<PlanRecord["draft"]>["versions"][number]["schedule"]
      >["slots"][number];
      slotB: NonNullable<
        NonNullable<PlanRecord["draft"]>["versions"][number]["schedule"]
      >["slots"][number];
    };
  }>;
  postPlanScheduleSlotCheckin(input: {
    id: string;
    slotKey: string;
    token: string;
    content?: string;
    attachments?: Array<{ url: string; fileName?: string; kind?: string }>;
    /** 客户端幂等键（服务端支持时可用于去重；不支持也不会影响兼容性） */
    idempotencyKey?: string;
  }): Promise<{ submission: ScheduleSlotCheckinRecord }>;
  /** DELETE .../checkins：撤销本打卡段的完成记录（通常仅删除最新一次/当前有效记录） */
  deletePlanScheduleSlotCheckin(input: {
    id: string;
    slotKey: string;
    token: string;
  }): Promise<{ ok: true }>;
  postPlanScheduleSlotAppeal(input: {
    id: string;
    slotKey: string;
    token: string;
    content: string;
    proofContent?: string;
    proofAttachments?: Array<{ url: string; fileName?: string; kind?: string }>;
    lastReview?: CheckinPublicReview;
  }): Promise<SlotAppealResponse>;
  deletePlanScheduleSlotAppeal(input: {
    id: string;
    slotKey: string;
    token: string;
  }): Promise<{ ok: true }>;
  regeneratePlan(input: {
    id: string;
    token: string;
    requirement?: string;
    granularityMode?: "smart" | "deep" | "rough";
  }): Promise<{
    versions: NonNullable<PlanRecord["draft"]>["versions"];
    maxVersions: number;
    confirmedVersion: number | null;
    canRegenerate: boolean;
  }>;
  confirmPlan(input: { id: string; token: string; version: number }): Promise<{
    plan: PlanRecord;
    confirmedVersion: number;
  }>;
  comparePlanVersions(input: {
    id: string;
    token: string;
    base: number;
    target: number;
  }): Promise<{
    baseVersion: number;
    targetVersion: number;
    addedStages: string[];
    removedStages: string[];
    addedTasks: string[];
    removedTasks: string[];
  }>;
  listPresets(input?: {
    category?: string;
  }): Promise<{ items: PresetTemplateBrief[] }>;
  listMarketTemplates(input: {
    q?: string;
    category?: string;
    tag?: string;
    sort?: "likes" | "new";
    page?: number;
    pageSize?: number;
    /** 传入则列表项含 favorited / likedByMe */
    token?: string;
  }): Promise<MarketListResult>;
  listMyMarketTemplates(input: {
    token: string;
    scope: "created" | "favorited" | "liked";
    q?: string;
    category?: string;
    tag?: string;
    sort?: "likes" | "new";
    page?: number;
    pageSize?: number;
  }): Promise<MarketListResult>;
  publishMarketTemplate(input: PublishMarketTemplateInput): Promise<{
    id: string;
    title: string;
    summary: string;
    category: string;
    tags: string[];
    likeCount: number;
    publishedAt: string | null;
  }>;
  likeMarketTemplate(input: {
    id: string;
    token: string;
  }): Promise<{ liked: boolean; likeCount: number }>;
  unlikeMarketTemplate(input: {
    id: string;
    token: string;
  }): Promise<{ liked: boolean; likeCount: number }>;
  favoriteMarketTemplate(input: {
    id: string;
    token: string;
  }): Promise<{ favorited: boolean }>;
  unfavoriteMarketTemplate(input: {
    id: string;
    token: string;
  }): Promise<{ favorited: boolean }>;
  unpublishMarketTemplate(input: { id: string; token: string }): Promise<{ ok: true }>;
  patchMarketTemplate(input: {
    id: string;
    token: string;
    title?: string;
    summary?: string;
    category?: string;
    tags?: string[];
  }): Promise<{ ok: true }>;
  applyPresetTemplate(input: {
    id: string;
    token: string;
  }): Promise<{ planId: string }>;
  applyMarketTemplate(input: {
    id: string;
    token: string;
  }): Promise<{ planId: string }>;
  getMarketTemplateDetail(input: { id: string; token?: string }): Promise<MarketTemplateDetail>;
  /** GET /templates/presets/:id，返回结构与 MarketTemplateDetail 对齐 */
  getPresetTemplateDetail(input: { id: string; token?: string }): Promise<MarketTemplateDetail>;
  /** multipart 单文件，字段名 `file`；返回可写入提交的公开 URL */
  uploadUserFile(input: {
    token: string;
    file: File;
  }): Promise<{ path: string; url: string; fileName: string; kind: string }>;
};

function joinUrl(baseURL: string, path: string) {
  const normalizedBase = baseURL.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function readHttpErrorPayload(response: Response): Promise<{
  message: string;
  body: unknown;
}> {
  try {
    const payload = await response.json();
    const message =
      payload && typeof payload === "object" && payload !== null && "message" in payload
        ? String((payload as { message?: unknown }).message ?? "")
        : typeof payload === "string"
          ? payload
          : JSON.stringify(payload);
    return { message, body: payload };
  } catch {
    try {
      const text = (await response.text()) || "";
      return { message: text, body: undefined };
    } catch {
      return { message: "", body: undefined };
    }
  }
}

/** 非 2xx 时携带 HTTP 状态与原始 JSON body（如打卡 422 的 review） */
export class HttpApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "HttpApiError";
    this.status = status;
    this.body = body;
  }
}

/** 与 createApiClient 默认行为一致（去掉末尾 `/`），供流式 fetch 等与 JSON API 共用同一基址 */
export function getApiBaseURL(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
  return raw.replace(/\/$/, "");
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseURL = options.baseURL ?? getApiBaseURL();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  async function request<T>(path: string, init: RequestInit) {
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined),
    };
    const method = (init.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD" && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    let response: Response;
    try {
      response = await fetchImpl(joinUrl(baseURL, path), {
        headers,
        ...init,
      });
    } catch (e) {
      throw new Error(formatApiErrorForUser(e));
    }

    if (!response.ok) {
      const { message, body } = await readHttpErrorPayload(response);
      throw new HttpApiError(
        formatHttpApiUserMessage(response.status, message),
        response.status,
        body,
      );
    }

    return (await response.json()) as T;
  }

  return {
    login(input) {
      return request<{ token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    forgotPassword(input) {
      return request<ForgotPasswordResponse>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: input.email }),
      });
    },
    getCaptcha() {
      return request<CaptchaSessionResponse>("/auth/captcha", {
        method: "GET",
      });
    },
    sendOtp(input) {
      return request<OtpSendResponse>("/auth/otp/send", {
        method: "POST",
        body: JSON.stringify({
          phone: input.phone,
          purpose: input.purpose ?? "login",
          captchaId: input.captchaId,
          captchaText: input.captchaText,
        }),
      });
    },
    verifyOtp(input) {
      return request<OtpVerifyResponse>("/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({
          phone: input.phone,
          code: input.code,
          purpose: input.purpose ?? "login",
          ...(input.password != null ? { password: input.password } : {}),
          ...(input.passwordConfirm != null
            ? { passwordConfirm: input.passwordConfirm }
            : {}),
        }),
      });
    },
    getAuthMe(input) {
      return request<AuthMeResponse>("/auth/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    getPlanHeatmap(input) {
      const q =
        input.year != null
          ? `?year=${encodeURIComponent(String(input.year))}`
          : "";
      return request<PlanHeatmapResponse>(`/me/plan-heatmap${q}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    getUserInsights(input) {
      return request<UserInsightsResponse>("/me/insights", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    getPlanAssistantContext(input) {
      return request<PlanAssistantContextResponse>("/me/plan-assistant-context", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    patchPlanAssistantProfile(input) {
      const { token, ...body } = input;
      return request<PlanAssistantContextResponse>("/me/plan-assistant-profile", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    },
    postPlanAssistantPinNote(input) {
      return request<PlanAssistantContextResponse>(
        "/me/plan-assistant-profile/pin-note",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.token}`,
          },
          body: JSON.stringify({ text: input.text }),
        },
      );
    },
    listNotifications(input) {
      const p = new URLSearchParams();
      if (input.limit != null) p.set("limit", String(input.limit));
      if (input.cursor) p.set("cursor", input.cursor);
      const q = p.toString();
      return request<{
        items: InAppNotificationItem[];
        nextCursor: string | null;
      }>(`/notifications${q ? `?${q}` : ""}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    getNotificationsUnreadCount(input) {
      return request<{ unreadCount: number }>("/notifications/unread-count", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    patchNotificationRead(input) {
      return request<{ ok: true }>(
        `/notifications/${encodeURIComponent(input.id)}/read`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${input.token}`,
          },
        },
      );
    },
    postNotificationsReadAll(input) {
      return request<{ ok: true }>("/notifications/read-all", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    getNotificationPreferences(input) {
      return request<NotificationPreferences>("/me/notification-preferences", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    patchNotificationPreferences(input) {
      return request<NotificationPreferences>("/me/notification-preferences", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
        body: JSON.stringify({
          remindAt: input.remindAt,
          timeZone: input.timeZone,
        }),
      });
    },
    listPlans(input) {
      const params = new URLSearchParams();
      if (input.sort === "deadline") {
        params.set("sort", "deadline");
      } else if (input.sort === "created") {
        params.set("sort", "created");
      }
      const qs = params.toString();
      return request<{ plans: PlanListRow[] }>(`/plans${qs ? `?${qs}` : ""}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    deletePlan(input) {
      return request<{ ok: true }>(`/plans/${input.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    restorePlan(input) {
      return request<{ ok: true }>(`/plans/${input.id}/restore`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    listDeletedPlans(input) {
      return request<{ plans: DeletedPlanListRow[] }>(`/plans/trash`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    listArchivedPlans(input) {
      const params = new URLSearchParams();
      const limit = input.limit ?? 20;
      const offset = input.offset ?? 0;
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (input.sort === "deadline") {
        params.set("sort", "deadline");
      } else if (input.sort === "created") {
        params.set("sort", "created");
      }
      const trimmed = input.search?.trim();
      if (trimmed) {
        params.set("search", trimmed);
      }
      const qs = params.toString();
      return request<{ plans: ArchivedPlanListRow[]; hasMore: boolean }>(
        `/plans/archive?${qs}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${input.token}`,
          },
        },
      );
    },
    archivePlan(input) {
      return request<{ ok: true }>(`/plans/${input.id}/archive`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    unarchivePlan(input) {
      return request<{ ok: true }>(`/plans/${input.id}/unarchive`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    createPlan(input) {
      return request<PlanRecord>("/plans", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
        body: JSON.stringify({
          goal: input.goal,
          deadline: input.deadline,
          requirement: input.requirement,
          type: input.type,
          profile: input.profile,
          ...(input.parentPlanId?.trim()
            ? { parentPlanId: input.parentPlanId.trim() }
            : {}),
        }),
      });
    },
    createSubmission(input) {
      return request<SubmissionRecord>(`/tasks/${input.taskId}/submissions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
        body: JSON.stringify({
          content: input.content,
          imageUrls: input.imageUrls,
        }),
      });
    },
    planAssistant(input) {
      return request<PlanAssistantResult>("/plans/assistant", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
        body: JSON.stringify({
          mode: input.mode,
          goal: input.goal,
          requirement: input.requirement,
          startDate: input.startDate,
          cycle: input.cycle,
          endDate: input.endDate,
          granularityMode: input.granularityMode,
          message: input.message,
          tier: input.tier,
          agent: input.agent,
        }),
      });
    },
    planAssistantApplyOption(input) {
      return request<PlanAssistantApplyOptionResult>(
        "/plans/assistant/apply-option",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.token}`,
          },
          body: JSON.stringify({
            baseSuggestedContent: input.baseSuggestedContent,
            baseSchedule: input.baseSchedule,
            optionId: input.optionId,
            customText: input.customText,
            context: input.context,
          }),
        },
      );
    },
    parsePlanFile(input) {
      return request<ParsePlanFileResult>("/plans/parse-file", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
        body: JSON.stringify({
          fileName: input.fileName,
          contentBase64: input.contentBase64,
        }),
      });
    },
    getPlan(input) {
      return request<PlanRecord>(`/plans/${input.id}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    patchPlan(input) {
      const body: Record<string, string> = {};
      if (input.nextStep !== undefined) body.nextStep = input.nextStep;
      return request<{ nextStep: string | null }>(`/plans/${input.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
        body: JSON.stringify(body),
      });
    },
    getPlanDraft(input) {
      return request<PlanDraftSessionPayload>(`/plans/${input.id}/draft`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    patchPlanScheduleSlot(input) {
      return request<{
        schedule: NonNullable<
          NonNullable<PlanRecord["draft"]>["versions"][number]["schedule"]
        >;
        slot: NonNullable<
          NonNullable<PlanRecord["draft"]>["versions"][number]["schedule"]
        >["slots"][number];
      }>(
        `/plans/${input.id}/schedule/slots/${encodeURIComponent(input.slotKey)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${input.token}`,
          },
          body: JSON.stringify({
            content: input.content,
            restore: input.restore,
            version: input.version,
          }),
        },
      );
    },
    postPlanScheduleSwapContent(input) {
      return request<{
        schedule: NonNullable<
          NonNullable<PlanRecord["draft"]>["versions"][number]["schedule"]
        >;
        slots: {
          slotA: NonNullable<
            NonNullable<PlanRecord["draft"]>["versions"][number]["schedule"]
          >["slots"][number];
          slotB: NonNullable<
            NonNullable<PlanRecord["draft"]>["versions"][number]["schedule"]
          >["slots"][number];
        };
      }>(`/plans/${input.id}/schedule/slots/swap-content`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
        body: JSON.stringify({
          slotKeyA: input.slotKeyA,
          slotKeyB: input.slotKeyB,
          version: input.version,
        }),
      });
    },
    postPlanScheduleSlotCheckin(input) {
      const hasPayload =
        (input.content != null && String(input.content).trim().length > 0) ||
        (Array.isArray(input.attachments) && input.attachments.length > 0);
      return request<{ submission: ScheduleSlotCheckinRecord }>(
        `/plans/${input.id}/schedule/slots/${encodeURIComponent(input.slotKey)}/checkins`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.token}`,
            ...(input.idempotencyKey
              ? { "Idempotency-Key": input.idempotencyKey }
              : {}),
          },
          body: hasPayload
            ? JSON.stringify({
                content: input.content,
                attachments: input.attachments,
              })
            : undefined,
        },
      );
    },
    deletePlanScheduleSlotCheckin(input) {
      return request<{ ok: true }>(
        `/plans/${input.id}/schedule/slots/${encodeURIComponent(input.slotKey)}/checkins`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${input.token}`,
          },
        },
      );
    },
    postPlanScheduleSlotAppeal(input) {
      return request<SlotAppealResponse>(
        `/plans/${input.id}/schedule/slots/${encodeURIComponent(input.slotKey)}/appeals`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.token}`,
          },
          body: JSON.stringify({
            content: input.content,
            ...(input.proofContent != null ? { proofContent: input.proofContent } : {}),
            ...(input.proofAttachments != null && input.proofAttachments.length
              ? { proofAttachments: input.proofAttachments }
              : {}),
            ...(input.lastReview != null ? { lastReview: input.lastReview } : {}),
          }),
        },
      );
    },
    deletePlanScheduleSlotAppeal(input) {
      return request<{ ok: true }>(
        `/plans/${input.id}/schedule/slots/${encodeURIComponent(input.slotKey)}/appeals`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${input.token}`,
          },
        },
      );
    },
    regeneratePlan(input) {
      return request<{
        versions: NonNullable<PlanRecord["draft"]>["versions"];
        maxVersions: number;
        confirmedVersion: number | null;
        canRegenerate: boolean;
      }>(`/plans/${input.id}/regenerate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
        body: JSON.stringify({
          requirement: input.requirement,
          granularityMode: input.granularityMode,
        }),
      });
    },
    confirmPlan(input) {
      return request<{
        plan: PlanRecord;
        confirmedVersion: number;
      }>(`/plans/${input.id}/confirm`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
        body: JSON.stringify({
          version: input.version,
        }),
      });
    },
    comparePlanVersions(input) {
      const query = `base=${input.base}&target=${input.target}`;
      return request<{
        baseVersion: number;
        targetVersion: number;
        addedStages: string[];
        removedStages: string[];
        addedTasks: string[];
        removedTasks: string[];
      }>(`/plans/${input.id}/compare?${query}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    listPresets(input) {
      const q = input?.category?.trim()
        ? `?category=${encodeURIComponent(input.category.trim())}`
        : "";
      return request<{ items: PresetTemplateBrief[] }>(
        `/templates/presets${q}`,
        {
          method: "GET",
        },
      );
    },
    listMarketTemplates(input) {
      const params = new URLSearchParams();
      if (input.q?.trim()) params.set("q", input.q.trim());
      if (input.category?.trim()) params.set("category", input.category.trim());
      if (input.tag?.trim()) params.set("tag", input.tag.trim());
      if (input.sort) params.set("sort", input.sort);
      if (input.page != null) params.set("page", String(input.page));
      if (input.pageSize != null)
        params.set("pageSize", String(input.pageSize));
      const qs = params.toString();
      const headers: Record<string, string> = {};
      if (input.token) headers.Authorization = `Bearer ${input.token}`;
      return request<MarketListResult>(
        `/templates/market${qs ? `?${qs}` : ""}`,
        {
          method: "GET",
          headers,
        },
      );
    },
    listMyMarketTemplates(input) {
      const params = new URLSearchParams();
      params.set("scope", input.scope);
      if (input.q?.trim()) params.set("q", input.q.trim());
      if (input.category?.trim()) params.set("category", input.category.trim());
      if (input.tag?.trim()) params.set("tag", input.tag.trim());
      if (input.sort) params.set("sort", input.sort);
      if (input.page != null) params.set("page", String(input.page));
      if (input.pageSize != null)
        params.set("pageSize", String(input.pageSize));
      const qs = params.toString();
      return request<MarketListResult>(`/templates/my/market?${qs}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${input.token}` },
      });
    },
    publishMarketTemplate(input) {
      const body: Record<string, unknown> = {
        title: input.title,
        summary: input.summary,
        category: input.category,
        tags: input.tags,
      };
      if (input.planId) body.planId = input.planId;
      if (input.payload) body.payload = input.payload;
      return request(`/templates/market`, {
        method: "POST",
        headers: { Authorization: `Bearer ${input.token}` },
        body: JSON.stringify(body),
      });
    },
    likeMarketTemplate(input) {
      return request<{ liked: boolean; likeCount: number }>(
        `/templates/market/${input.id}/like`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${input.token}` },
        },
      );
    },
    unlikeMarketTemplate(input) {
      return request<{ liked: boolean; likeCount: number }>(
        `/templates/market/${input.id}/like`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${input.token}` },
        },
      );
    },
    favoriteMarketTemplate(input) {
      return request<{ favorited: boolean }>(
        `/templates/market/${input.id}/favorite`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${input.token}` },
        },
      );
    },
    unfavoriteMarketTemplate(input) {
      return request<{ favorited: boolean }>(
        `/templates/market/${input.id}/favorite`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${input.token}` },
        },
      );
    },
    unpublishMarketTemplate(input) {
      return request<{ ok: true }>(`/templates/market/${input.id}/unpublish`, {
        method: "POST",
        headers: { Authorization: `Bearer ${input.token}` },
      });
    },
    patchMarketTemplate(input) {
      return request<{ ok: true }>(`/templates/market/${input.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${input.token}` },
        body: JSON.stringify({
          title: input.title,
          summary: input.summary,
          category: input.category,
          tags: input.tags,
        }),
      });
    },
    applyPresetTemplate(input) {
      return request<{ planId: string }>(
        `/templates/presets/${input.id}/apply`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${input.token}` },
        },
      );
    },
    applyMarketTemplate(input) {
      return request<{ planId: string }>(
        `/templates/market/${input.id}/apply`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${input.token}` },
        },
      );
    },
    getMarketTemplateDetail(input) {
      const headers: Record<string, string> = {};
      if (input.token) headers.Authorization = `Bearer ${input.token}`;
      return request<MarketTemplateDetail>(`/templates/market/${encodeURIComponent(input.id)}`, {
        method: "GET",
        headers,
      });
    },
    getPresetTemplateDetail(input) {
      const headers: Record<string, string> = {};
      if (input.token) headers.Authorization = `Bearer ${input.token}`;
      return request<MarketTemplateDetail>(`/templates/presets/${encodeURIComponent(input.id)}`, {
        method: "GET",
        headers,
      });
    },
    async uploadUserFile(input) {
      const fd = new FormData();
      fd.append("file", input.file);
      let response: Response;
      try {
        response = await fetchImpl(joinUrl(baseURL, "/uploads"), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.token}`,
          },
          body: fd,
        });
      } catch (e) {
        throw new Error(formatApiErrorForUser(e));
      }
      if (!response.ok) {
        const { message } = await readHttpErrorPayload(response);
        throw new HttpApiError(
          formatHttpApiUserMessage(response.status, message),
          response.status,
          undefined,
        );
      }
      return (await response.json()) as {
        path: string;
        url: string;
        fileName: string;
        kind: string;
      };
    },
  };
}

let currentApiClient = createApiClient();

export function setApiClient(client: ApiClient) {
  currentApiClient = client;
}

export function getApiClient() {
  return currentApiClient;
}
