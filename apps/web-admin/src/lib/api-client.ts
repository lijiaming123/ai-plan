export type AdminLoginInput = {
  email: string;
  password: string;
};

export type AdminRuleRecord = {
  id: string;
  key: string;
  value: string;
  description: string;
  enabled: boolean;
};

export type AdminSubmissionImage = {
  id: string;
  url: string;
  hash: string;
};

export type AdminSubmissionRecord = {
  id: string;
  taskId: string;
  userId: string;
  content: string;
  status: string;
  createdAt: string;
  images: AdminSubmissionImage[];
};

export type AdminDashboardSummary = {
  planCount: number;
  submissionCount: number;
  ruleCount: number;
  completedCount: number;
  retryCount: number;
  recentSubmissions: Array<{
    id: string;
    taskId: string;
    userId: string;
    status: string;
    content: string;
    createdAt: string;
  }>;
};

export type AdminApiClient = {
  login(input: AdminLoginInput): Promise<{ token: string }>;
  getDashboard(token: string): Promise<AdminDashboardSummary>;
  getRules(token: string): Promise<AdminRuleRecord[]>;
  getSubmissions(token: string): Promise<AdminSubmissionRecord[]>;
};

export type AdminApiClientOptions = {
  baseURL?: string;
  fetchImpl?: typeof fetch;
};

function joinUrl(baseURL: string, path: string) {
  const normalizedBase = baseURL.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export function createAdminApiClient(options: AdminApiClientOptions = {}): AdminApiClient {
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
    getDashboard(token) {
      return request<AdminDashboardSummary>('/admin/dashboard', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    },
    getRules(token) {
      return request<AdminRuleRecord[]>('/admin/rules', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    },
    getSubmissions(token) {
      return request<AdminSubmissionRecord[]>('/admin/submissions', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    },
  };
}

let currentAdminApiClient = createAdminApiClient();

export function setAdminApiClient(client: AdminApiClient) {
  currentAdminApiClient = client;
}

export function getAdminApiClient() {
  return currentAdminApiClient;
}
