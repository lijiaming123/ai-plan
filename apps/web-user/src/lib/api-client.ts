import { formatApiErrorForUser, formatHttpApiUserMessage } from './api-error-message';

export type ApiClientOptions = {
  baseURL?: string;
  fetchImpl?: typeof fetch;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type AuthMeResponse = {
  userId: string;
  email: string;
  role: 'user' | 'admin';
};

export type PlanHeatmapDay = {
  date: string;
  status: 'completed' | 'missed' | 'none';
  summary?: { due: number; done: number };
};

export type PlanHeatmapResponse = {
  year: number;
  timeZone: string;
  days: PlanHeatmapDay[];
};

export type CreatePlanInput = {
  goal: string;
  deadline: string;
  requirement: string;
  type: 'general' | 'study' | 'work';
  token: string;
  profile?: {
    planMode: 'basic' | 'pro';
    basicInfo: {
      planScenario: 'study' | 'work' | 'exam' | 'fitness' | 'other';
      planName: string;
      planContent: string;
      currentLevel: 'none' | 'newbie' | 'junior' | 'intermediate' | 'advanced';
      startingPoint?: '' | 'none' | 'newbie' | 'junior' | 'intermediate' | 'advanced';
      startDate: string;
      cycle: '1w' | '1m' | '3m' | '6m' | 'custom';
      endDate: string;
      preference: string;
      focusAreas?: string[];
      timeInvestment: string;
      timeInvestmentCustomHours?: number;
      granularityMode?: 'smart' | 'deep' | 'rough';
    };
    proSettings?: {
      aiDepth: 'basic' | 'advanced';
      reminderMode: 'standard' | 'smart';
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
  mode: 'draft' | 'chat';
  goal: string;
  requirement: string;
  startDate: string;
  cycle: '1w' | '1m' | '3m' | '6m' | 'custom';
  endDate: string;
  granularityMode?: 'smart' | 'deep' | 'rough';
  message?: string;
};

export type PlanAssistantResult = {
  reply: string;
  suggestedContent: string;
  schedule?: {
    granularity: 'day' | 'week';
    slots: Array<{
      slotKey: string;
      generatedContent: string;
      content: string;
      contentSource: 'generated' | 'edited';
      editedAt?: string;
      editedByUserId?: string;
    }>;
  };
};

export type ParsePlanFileInput = {
  token: string;
  fileName: string;
  contentBase64: string;
};

export type ParsePlanFileResult = {
  text: string;
};

/** GET /plans 列表项（仅已定稿 Plan；生成中数据在 PlanGenerationDraft 表，不经列表暴露） */
export type PlanListRow = {
  id: string;
  goal: string;
  deadline: string;
  requirement: string;
  type: string;
  status: string;
  createdAt: string;
};

export type PlanRecord = {
  id: string;
  userId?: string;
  goal: string;
  deadline: string;
  requirement: string;
  type: string;
  status?: string;
  draft?: {
    versions: Array<{
      version: number;
      requirement: string;
      deadline: string;
      createdAt: string;
      schedule?: {
        granularity: 'day' | 'week';
        slots: Array<{
          slotKey: string;
          generatedContent: string;
          content: string;
          contentSource: 'generated' | 'edited';
          editedAt?: string;
          editedByUserId?: string;
        }>;
      };
      stages: Array<{
        name: string;
        sortOrder: number;
        tasks: Array<{
          id: string;
          title: string;
          order: number;
          timeSlotType?: 'day' | 'week' | 'month';
          timeSlotKey?: string;
          taskType?: 'action' | 'weekly_summary' | 'monthly_summary';
        }>;
      }>;
    }>;
    maxVersions: number;
    confirmedVersion: number | null;
    canRegenerate: boolean;
  } | null;
  /** 已定稿计划：各打卡槽的提交记录（GET /plans/:id） */
  scheduleSlotSubmissions?: Record<string, ScheduleSlotCheckinRecord[]>;
};

/** GET /plans/:id/draft：生成中会话（含主档字段 + 版本树） */
export type PlanDraftSessionPayload = {
  goal: string;
  deadline: string;
  type: string;
  requirement: string;
} & NonNullable<PlanRecord['draft']>;

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
  /** 登录访问市场列表时由后端返回 */
  favorited?: boolean;
  likedByMe?: boolean;
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

export type ApiClient = {
  login(input: LoginInput): Promise<{ token: string }>;
  getAuthMe(input: { token: string }): Promise<AuthMeResponse>;
  getPlanHeatmap(input: { token: string; year?: number }): Promise<PlanHeatmapResponse>;
  listPlans(input: {
    token: string;
    /** `deadline`：按截止日期升序（更近的在前）。默认按创建时间倒序。 */
    sort?: 'created' | 'deadline';
  }): Promise<{ plans: PlanListRow[] }>;
  createPlan(input: CreatePlanInput): Promise<PlanRecord>;
  createSubmission(input: CreateSubmissionInput): Promise<SubmissionRecord>;
  planAssistant(input: PlanAssistantInput): Promise<PlanAssistantResult>;
  parsePlanFile(input: ParsePlanFileInput): Promise<ParsePlanFileResult>;
  getPlan(input: { id: string; token: string }): Promise<PlanRecord>;
  getPlanDraft(input: { id: string; token: string }): Promise<PlanDraftSessionPayload>;
  patchPlanScheduleSlot(input: {
    id: string;
    slotKey: string;
    token: string;
    content?: string;
    restore?: boolean;
    /** 草稿多版本时指定 PlanVersion.version，避免误改 currentVersion 对应行 */
    version?: number;
  }): Promise<{
    schedule: NonNullable<NonNullable<PlanRecord['draft']>['versions'][number]['schedule']>;
    slot: NonNullable<NonNullable<PlanRecord['draft']>['versions'][number]['schedule']>['slots'][number];
  }>;
  postPlanScheduleSlotCheckin(input: {
    id: string;
    slotKey: string;
    token: string;
    content?: string;
    attachments?: Array<{ url: string; fileName?: string; kind?: string }>;
  }): Promise<{ submission: ScheduleSlotCheckinRecord }>;
  regeneratePlan(input: {
    id: string;
    token: string;
    requirement?: string;
    granularityMode?: 'smart' | 'deep' | 'rough';
  }): Promise<{
    versions: NonNullable<PlanRecord['draft']>['versions'];
    maxVersions: number;
    confirmedVersion: number | null;
    canRegenerate: boolean;
  }>;
  confirmPlan(input: { id: string; token: string; version: number }): Promise<{
    plan: PlanRecord;
    confirmedVersion: number;
  }>;
  comparePlanVersions(input: { id: string; token: string; base: number; target: number }): Promise<{
    baseVersion: number;
    targetVersion: number;
    addedStages: string[];
    removedStages: string[];
    addedTasks: string[];
    removedTasks: string[];
  }>;
  listPresets(input?: { category?: string }): Promise<{ items: PresetTemplateBrief[] }>;
  listMarketTemplates(input: {
    q?: string;
    category?: string;
    tag?: string;
    sort?: 'likes' | 'new';
    page?: number;
    pageSize?: number;
    /** 传入则列表项含 favorited / likedByMe */
    token?: string;
  }): Promise<MarketListResult>;
  listMyMarketTemplates(input: {
    token: string;
    scope: 'created' | 'favorited' | 'liked';
    q?: string;
    category?: string;
    tag?: string;
    sort?: 'likes' | 'new';
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
  likeMarketTemplate(input: { id: string; token: string }): Promise<{ liked: boolean; likeCount: number }>;
  unlikeMarketTemplate(input: { id: string; token: string }): Promise<{ liked: boolean; likeCount: number }>;
  favoriteMarketTemplate(input: { id: string; token: string }): Promise<{ favorited: boolean }>;
  unfavoriteMarketTemplate(input: { id: string; token: string }): Promise<{ favorited: boolean }>;
  applyPresetTemplate(input: { id: string; token: string }): Promise<{ planId: string }>;
  applyMarketTemplate(input: { id: string; token: string }): Promise<{ planId: string }>;
  /** multipart 单文件，字段名 `file`；返回可写入提交的公开 URL */
  uploadUserFile(input: {
    token: string;
    file: File;
  }): Promise<{ path: string; url: string; fileName: string; kind: string }>;
};

function joinUrl(baseURL: string, path: string) {
  const normalizedBase = baseURL.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function readHttpErrorDetail(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (payload && typeof payload === 'object' && 'message' in payload) {
      return String((payload as { message?: string }).message ?? '');
    }
    return typeof payload === 'string' ? payload : JSON.stringify(payload);
  } catch {
    try {
      return (await response.text()) || '';
    } catch {
      return '';
    }
  }
}

/** 与 createApiClient 默认行为一致（去掉末尾 `/`），供流式 fetch 等与 JSON API 共用同一基址 */
export function getApiBaseURL(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
  return raw.replace(/\/$/, '');
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseURL = options.baseURL ?? getApiBaseURL();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  async function request<T>(path: string, init: RequestInit) {
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined),
    };
    const method = (init.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
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
      const detail = await readHttpErrorDetail(response);
      throw new Error(formatHttpApiUserMessage(response.status, detail));
    }

    return (await response.json()) as T;
  }

  return {
    login(input) {
      return request<{ token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    getAuthMe(input) {
      return request<AuthMeResponse>('/auth/me', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    getPlanHeatmap(input) {
      const q = input.year != null ? `?year=${encodeURIComponent(String(input.year))}` : '';
      return request<PlanHeatmapResponse>(`/me/plan-heatmap${q}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    listPlans(input) {
      const params = new URLSearchParams();
      if (input.sort === 'deadline') {
        params.set('sort', 'deadline');
      } else if (input.sort === 'created') {
        params.set('sort', 'created');
      }
      const qs = params.toString();
      return request<{ plans: PlanListRow[] }>(`/plans${qs ? `?${qs}` : ''}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    createPlan(input) {
      return request<PlanRecord>('/plans', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
        body: JSON.stringify({
          goal: input.goal,
          deadline: input.deadline,
          requirement: input.requirement,
          type: input.type,
          profile: input.profile,
        }),
      });
    },
    createSubmission(input) {
      return request<SubmissionRecord>(`/tasks/${input.taskId}/submissions`, {
        method: 'POST',
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
      return request<PlanAssistantResult>('/plans/assistant', {
        method: 'POST',
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
        }),
      });
    },
    parsePlanFile(input) {
      return request<ParsePlanFileResult>('/plans/parse-file', {
        method: 'POST',
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
        method: 'GET',
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    getPlanDraft(input) {
      return request<PlanDraftSessionPayload>(`/plans/${input.id}/draft`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    patchPlanScheduleSlot(input) {
      return request<{
        schedule: NonNullable<NonNullable<PlanRecord['draft']>['versions'][number]['schedule']>;
        slot: NonNullable<NonNullable<PlanRecord['draft']>['versions'][number]['schedule']>['slots'][number];
      }>(`/plans/${input.id}/schedule/slots/${encodeURIComponent(input.slotKey)}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
        body: JSON.stringify({
          content: input.content,
          restore: input.restore,
          version: input.version,
        }),
      });
    },
    postPlanScheduleSlotCheckin(input) {
      return request<{ submission: ScheduleSlotCheckinRecord }>(
        `/plans/${input.id}/schedule/slots/${encodeURIComponent(input.slotKey)}/checkins`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${input.token}`,
          },
          body: JSON.stringify({
            content: input.content,
            attachments: input.attachments,
          }),
        }
      );
    },
    regeneratePlan(input) {
      return request<{
        versions: NonNullable<PlanRecord['draft']>['versions'];
        maxVersions: number;
        confirmedVersion: number | null;
        canRegenerate: boolean;
      }>(`/plans/${input.id}/regenerate`, {
        method: 'POST',
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
        method: 'POST',
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
        method: 'GET',
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    listPresets(input) {
      const q = input?.category?.trim()
        ? `?category=${encodeURIComponent(input.category.trim())}`
        : '';
      return request<{ items: PresetTemplateBrief[] }>(`/templates/presets${q}`, {
        method: 'GET',
      });
    },
    listMarketTemplates(input) {
      const params = new URLSearchParams();
      if (input.q?.trim()) params.set('q', input.q.trim());
      if (input.category?.trim()) params.set('category', input.category.trim());
      if (input.tag?.trim()) params.set('tag', input.tag.trim());
      if (input.sort) params.set('sort', input.sort);
      if (input.page != null) params.set('page', String(input.page));
      if (input.pageSize != null) params.set('pageSize', String(input.pageSize));
      const qs = params.toString();
      const headers: Record<string, string> = {};
      if (input.token) headers.Authorization = `Bearer ${input.token}`;
      return request<MarketListResult>(`/templates/market${qs ? `?${qs}` : ''}`, {
        method: 'GET',
        headers,
      });
    },
    listMyMarketTemplates(input) {
      const params = new URLSearchParams();
      params.set('scope', input.scope);
      if (input.q?.trim()) params.set('q', input.q.trim());
      if (input.category?.trim()) params.set('category', input.category.trim());
      if (input.tag?.trim()) params.set('tag', input.tag.trim());
      if (input.sort) params.set('sort', input.sort);
      if (input.page != null) params.set('page', String(input.page));
      if (input.pageSize != null) params.set('pageSize', String(input.pageSize));
      const qs = params.toString();
      return request<MarketListResult>(`/templates/my/market?${qs}`, {
        method: 'GET',
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
        method: 'POST',
        headers: { Authorization: `Bearer ${input.token}` },
        body: JSON.stringify(body),
      });
    },
    likeMarketTemplate(input) {
      return request<{ liked: boolean; likeCount: number }>(`/templates/market/${input.id}/like`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${input.token}` },
      });
    },
    unlikeMarketTemplate(input) {
      return request<{ liked: boolean; likeCount: number }>(`/templates/market/${input.id}/like`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${input.token}` },
      });
    },
    favoriteMarketTemplate(input) {
      return request<{ favorited: boolean }>(`/templates/market/${input.id}/favorite`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${input.token}` },
      });
    },
    unfavoriteMarketTemplate(input) {
      return request<{ favorited: boolean }>(`/templates/market/${input.id}/favorite`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${input.token}` },
      });
    },
    applyPresetTemplate(input) {
      return request<{ planId: string }>(`/templates/presets/${input.id}/apply`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${input.token}` },
      });
    },
    applyMarketTemplate(input) {
      return request<{ planId: string }>(`/templates/market/${input.id}/apply`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${input.token}` },
      });
    },
    async uploadUserFile(input) {
      const fd = new FormData();
      fd.append('file', input.file);
      let response: Response;
      try {
        response = await fetchImpl(joinUrl(baseURL, '/uploads'), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${input.token}`,
          },
          body: fd,
        });
      } catch (e) {
        throw new Error(formatApiErrorForUser(e));
      }
      if (!response.ok) {
        const detail = await readHttpErrorDetail(response);
        throw new Error(formatHttpApiUserMessage(response.status, detail));
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
