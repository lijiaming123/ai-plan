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
      outputMode: 'daily' | 'phase-weekly' | 'phase-monthly';
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
  message?: string;
};

export type PlanAssistantResult = {
  reply: string;
  suggestedContent: string;
};

export type ParsePlanFileInput = {
  token: string;
  fileName: string;
  contentBase64: string;
};

export type ParsePlanFileResult = {
  text: string;
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
};

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

export type ApiClient = {
  login(input: LoginInput): Promise<{ token: string }>;
  getAuthMe(input: { token: string }): Promise<AuthMeResponse>;
  createPlan(input: CreatePlanInput): Promise<PlanRecord>;
  createSubmission(input: CreateSubmissionInput): Promise<SubmissionRecord>;
  planAssistant(input: PlanAssistantInput): Promise<PlanAssistantResult>;
  parsePlanFile(input: ParsePlanFileInput): Promise<ParsePlanFileResult>;
  getPlan(input: { id: string; token: string }): Promise<PlanRecord>;
  getPlanDraft(input: { id: string; token: string }): Promise<NonNullable<PlanRecord['draft']>>;
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
};

function joinUrl(baseURL: string, path: string) {
  const normalizedBase = baseURL.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
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
    const response = await fetchImpl(joinUrl(baseURL, path), {
      headers,
      ...init,
    });

    if (!response.ok) {
      let detail = '';
      try {
        const payload = await response.json();
        if (payload && typeof payload === 'object' && 'message' in payload) {
          detail = ` - ${(payload as { message?: string }).message ?? ''}`;
        } else {
          detail = ` - ${JSON.stringify(payload)}`;
        }
      } catch {
        try {
          const text = await response.text();
          if (text) detail = ` - ${text}`;
        } catch {
          detail = '';
        }
      }
      throw new Error(`Request failed: ${response.status}${detail}`);
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
      return request<NonNullable<PlanRecord['draft']>>(`/plans/${input.id}/draft`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
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
  };
}

let currentApiClient = createApiClient();

export function setApiClient(client: ApiClient) {
  currentApiClient = client;
}

export function getApiClient() {
  return currentApiClient;
}
