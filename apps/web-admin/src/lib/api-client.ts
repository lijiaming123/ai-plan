/** `email` 与接口字段名一致；值为管理员登录标识（短账号或邮箱） */
export type AdminLoginInput = {
  email: string;
  password: string;
};

export type AdminRegisterInput = {
  email: string;
  password: string;
  preset?: 'analyst' | 'auditor';
};

export type AdminPermission =
  | 'analytics:read'
  | 'analytics:export'
  | 'users:read'
  | 'users:write'
  | 'audit:read'
  | 'rbac:manage';

export type AdminMeResponse = {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
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

export type AdminAuditLogRecord = {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  summary: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type AdminAuditLogQuery = {
  limit?: number;
  actorId?: string;
  action?: string;
  from?: string;
  to?: string;
};

export type RecordAuditEventInput = {
  action: string;
  summary?: string;
  meta?: unknown;
  targetType?: string;
  targetId?: string;
};

export type AdminAccountRecord = {
  id: string;
  loginId: string;
  email: string | null;
  permissions: string[];
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateAdminAccountInput = {
  loginId: string;
  email?: string | null;
  password: string;
  presetKey?: 'super-admin' | 'analyst' | 'auditor';
  permissions?: string[];
};

export type UpdateAdminAccountInput = {
  email?: string | null;
  presetKey?: 'super-admin' | 'analyst' | 'auditor';
  permissions?: string[];
  disabled?: boolean;
};

export type AdminFunnelStep = {
  step: string;
  count: number;
  conversionFromPrev: number | null;
};

export type AdminFunnelResponse = {
  template: string;
  windowDays: number;
  start: string;
  end: string;
  steps: AdminFunnelStep[];
};

export type AdminFunnelQuery = {
  start: string;
  end: string;
  windowDays?: number;
  source?: string;
  platform?: string;
  clientVersion?: string;
};

export type AdminRetentionRetainedCell = {
  count: number;
  rate: number;
};

export type AdminRetentionRow = {
  cohortDay: string;
  cohortSize: number;
  retained: Record<string, AdminRetentionRetainedCell>;
};

export type AdminRetentionResponse = {
  cohortStart: string;
  cohortEnd: string;
  offsets: number[];
  rows: AdminRetentionRow[];
};

export type AdminRetentionQuery = {
  cohortStart: string;
  cohortEnd: string;
  offsets?: string;
  source?: string;
  platform?: string;
  clientVersion?: string;
};

export type AdminPathEntry = {
  path: string;
  count: number;
  share: number;
};

export type AdminPathResponse = {
  start: string;
  end: string;
  startEvent: string;
  pathLength: number;
  sessionGapMinutes: number;
  streamCount: number;
  totalPaths: number;
  paths: AdminPathEntry[];
};

export type AdminPathQuery = {
  start: string;
  end: string;
  startEvent?: string;
  pathLength?: number;
  top?: number;
  source?: string;
  platform?: string;
  clientVersion?: string;
};

export type AdminUserListItem = {
  userId: string;
};

export type AdminUserListResponse = {
  items: AdminUserListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type AdminUserListQuery = {
  q?: string;
  page?: number;
  pageSize?: number;
};

export type AdminUserDetail = {
  userId: string;
  planCount: number;
  checkinSubmissionCount: number;
  taskSubmissionCount: number;
  telemetryEventCount: number;
  registeredAtApprox: string | null;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  telemetryTopEvents: Array<{ eventName: string; count: number }>;
  phone?: string | null;
  planTier?: string | null;
  proExpiresAt?: string | null;
  proTrialUsed?: boolean;
  proSubscriptionSource?: string | null;
};

export type RenewProMonthResponse = {
  ok: true;
  planTier: 'pro';
  proExpiresAt: string;
  proSubscriptionSource: 'paid';
};

export type AdminApiClient = {
  login(input: AdminLoginInput): Promise<{ token: string }>;
  registerAdmin(input: AdminRegisterInput): Promise<{ token: string }>;
  getAdminMe(token: string): Promise<AdminMeResponse>;
  getDashboard(token: string): Promise<AdminDashboardSummary>;
  getRules(token: string): Promise<AdminRuleRecord[]>;
  getSubmissions(token: string): Promise<AdminSubmissionRecord[]>;
  getFunnel(token: string, query: AdminFunnelQuery): Promise<AdminFunnelResponse>;
  getRetention(token: string, query: AdminRetentionQuery): Promise<AdminRetentionResponse>;
  getPath(token: string, query: AdminPathQuery): Promise<AdminPathResponse>;
  getUsers(token: string, query: AdminUserListQuery): Promise<AdminUserListResponse>;
  getUser(token: string, userId: string): Promise<AdminUserDetail>;
  renewProMonth(token: string, userId: string): Promise<RenewProMonthResponse>;
  getAuditLogs(token: string, query: AdminAuditLogQuery): Promise<AdminAuditLogRecord[]>;
  recordAuditEvent(token: string, input: RecordAuditEventInput): Promise<{ ok: true }>;
  getRegisterOpen(): Promise<{ open: boolean }>;
  listAdminAccounts(token: string): Promise<AdminAccountRecord[]>;
  createAdminAccount(token: string, input: CreateAdminAccountInput): Promise<AdminAccountRecord>;
  updateAdminAccount(token: string, id: string, input: UpdateAdminAccountInput): Promise<AdminAccountRecord>;
  resetAdminAccountPassword(token: string, id: string, newPassword: string): Promise<{ ok: true }>;
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

/** 开发默认走 Vite 代理（相对路径），避免 shell 里残留的 VITE_API_BASE_URL 指向未监听的端口。关闭：VITE_DEV_API_PROXY=false */
function getDefaultAdminApiBaseURL(): string {
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_API_PROXY !== 'false') {
    return '';
  }
  return (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
}

export function createAdminApiClient(options: AdminApiClientOptions = {}): AdminApiClient {
  const baseURL = options.baseURL ?? getDefaultAdminApiBaseURL();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  async function request<T>(path: string, init: RequestInit) {
    const response = await fetchImpl(joinUrl(baseURL, path), {
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
      ...init,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        payload &&
        typeof payload === 'object' &&
        'message' in payload &&
        typeof payload.message === 'string'
          ? payload.message
          : `Request failed: ${response.status}`;
      throw new Error(message);
    }

    return payload as T;
  }

  return {
    login(input) {
      return request<{ token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    registerAdmin(input) {
      return request<{ token: string }>('/auth/admin/register', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    getAdminMe(token) {
      return request<AdminMeResponse>('/auth/admin/me', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
    getAuditLogs(token, query) {
      const qs = new URLSearchParams();
      if (query.limit != null) qs.set('limit', String(query.limit));
      if (query.actorId) qs.set('actorId', query.actorId);
      if (query.action) qs.set('action', query.action);
      if (query.from) qs.set('from', query.from);
      if (query.to) qs.set('to', query.to);
      const suffix = qs.size ? `?${qs.toString()}` : '';
      return request<{ items: AdminAuditLogRecord[] }>(`/admin/audit-logs${suffix}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }).then((res) => res.items ?? []);
    },
    recordAuditEvent(token, input) {
      return request<{ ok: true }>('/admin/audit-events', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(input),
      });
    },
    getRegisterOpen() {
      return request<{ open: boolean }>('/auth/admin/register-open', { method: 'GET' });
    },
    listAdminAccounts(token) {
      return request<{ items: AdminAccountRecord[] }>('/admin/admin-users', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => res.items ?? []);
    },
    createAdminAccount(token, input) {
      return request<AdminAccountRecord>('/admin/admin-users', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      });
    },
    updateAdminAccount(token, id, input) {
      return request<AdminAccountRecord>(`/admin/admin-users/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      });
    },
    resetAdminAccountPassword(token, id, newPassword) {
      return request<{ ok: true }>(`/admin/admin-users/${encodeURIComponent(id)}/reset-password`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword }),
      });
    },
    getFunnel(token, query) {
      const qs = new URLSearchParams();
      qs.set('start', query.start);
      qs.set('end', query.end);
      if (query.windowDays != null) qs.set('windowDays', String(query.windowDays));
      if (query.source) qs.set('source', query.source);
      if (query.platform) qs.set('platform', query.platform);
      if (query.clientVersion) qs.set('clientVersion', query.clientVersion);
      return request<AdminFunnelResponse>(`/analytics/funnel?${qs.toString()}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    },
    getRetention(token, query) {
      const qs = new URLSearchParams();
      qs.set('cohortStart', query.cohortStart);
      qs.set('cohortEnd', query.cohortEnd);
      if (query.offsets != null && query.offsets !== '') qs.set('offsets', query.offsets);
      if (query.source) qs.set('source', query.source);
      if (query.platform) qs.set('platform', query.platform);
      if (query.clientVersion) qs.set('clientVersion', query.clientVersion);
      return request<AdminRetentionResponse>(`/analytics/retention?${qs.toString()}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    },
    getPath(token, query) {
      const qs = new URLSearchParams();
      qs.set('start', query.start);
      qs.set('end', query.end);
      if (query.startEvent != null && query.startEvent !== '') qs.set('startEvent', query.startEvent);
      if (query.pathLength != null) qs.set('pathLength', String(query.pathLength));
      if (query.top != null) qs.set('top', String(query.top));
      if (query.source) qs.set('source', query.source);
      if (query.platform) qs.set('platform', query.platform);
      if (query.clientVersion) qs.set('clientVersion', query.clientVersion);
      return request<AdminPathResponse>(`/analytics/path?${qs.toString()}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    },
    getUsers(token, query) {
      const qs = new URLSearchParams();
      if (query.q != null && query.q !== '') qs.set('q', query.q);
      if (query.page != null) qs.set('page', String(query.page));
      if (query.pageSize != null) qs.set('pageSize', String(query.pageSize));
      return request<AdminUserListResponse>(`/admin/users?${qs.toString()}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    },
    getUser(token, userId) {
      const enc = encodeURIComponent(userId);
      return request<AdminUserDetail>(`/admin/users/${enc}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    },
    renewProMonth(token, userId) {
      const enc = encodeURIComponent(userId);
      return request<RenewProMonthResponse>(`/admin/users/${enc}/renew-pro-month`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    },
  };
}

let currentAdminApiClient = createAdminApiClient();

export function setAdminApiClient(client: Partial<AdminApiClient>) {
  currentAdminApiClient = { ...createAdminApiClient(), ...client };
}

export function getAdminApiClient() {
  return currentAdminApiClient;
}
