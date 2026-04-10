export type ApiClientOptions = {
  baseURL?: string;
  fetchImpl?: typeof fetch;
};

export type LoginInput = {
  email: string;
  password: string;
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
      planName: string;
      planContent: string;
      currentLevel: 'none' | 'newbie' | 'junior' | 'intermediate' | 'advanced';
      startDate: string;
      cycle: '1w' | '1m' | '3m' | '6m' | 'custom';
      endDate: string;
      preference: string;
      timeInvestment: string;
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
};

function joinUrl(baseURL: string, path: string) {
  const normalizedBase = baseURL.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseURL = options.baseURL ?? (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  async function request<T>(path: string, init: RequestInit) {
    const response = await fetchImpl(joinUrl(baseURL, path), {
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
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
  };
}

let currentApiClient = createApiClient();

export function setApiClient(client: ApiClient) {
  currentApiClient = client;
}

export function getApiClient() {
  return currentApiClient;
}
