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
};

export type PlanRecord = {
  id: string;
  goal: string;
  deadline: string;
  requirement: string;
  type: string;
};

export type ApiClient = {
  login(input: LoginInput): Promise<{ token: string }>;
  createPlan(input: CreatePlanInput): Promise<PlanRecord>;
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
      throw new Error(`Request failed: ${response.status}`);
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
        }),
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
