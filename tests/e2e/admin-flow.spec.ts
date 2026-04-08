import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../apps/api/src/app';
import { createApiClient } from '../../apps/web-user/src/lib/api-client';
import { createAdminApiClient } from '../../apps/web-admin/src/lib/api-client';

function createFetchImpl(app: ReturnType<typeof buildApp>) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
    const parsedUrl = new URL(url, 'http://localhost');
    const response = await app.inject({
      method: (init?.method ?? 'GET') as any,
      url: `${parsedUrl.pathname}${parsedUrl.search}`,
      headers: init?.headers as Record<string, string> | undefined,
      payload: init?.body ? JSON.parse(String(init.body)) : undefined,
    });

    return {
      ok: response.statusCode >= 200 && response.statusCode < 300,
      status: response.statusCode,
      json: async () => JSON.parse(response.body),
      text: async () => response.body,
    } as Response;
  };
}

describe('admin flow smoke', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('管理员可以查看总览、规则与提交审计', async () => {
    const fetchImpl = createFetchImpl(app);
    const userApi = createApiClient({ fetchImpl, baseURL: 'http://localhost' });
    const adminApi = createAdminApiClient({ fetchImpl, baseURL: 'http://localhost' });

    const userLogin = await userApi.login({
      email: 'demo@ai-plan.dev',
      password: 'Pass1234!',
    });

    await userApi.createPlan({
      token: userLogin.token,
      goal: '完成管理后台验证',
      deadline: '2026-10-01T00:00:00.000Z',
      requirement: '验证规则页',
      type: 'work',
    });

    await userApi.createSubmission({
      taskId: 'task_admin_1',
      token: userLogin.token,
      content: '提交一个用于后台审计的样例证据',
      imageUrls: ['https://cdn.test/admin.png'],
    });

    const adminLogin = await adminApi.login({
      email: 'admin@ai-plan.dev',
      password: 'Admin1234!',
    });

    const [dashboard, rules, submissions] = await Promise.all([
      adminApi.getDashboard(adminLogin.token),
      adminApi.getRules(adminLogin.token),
      adminApi.getSubmissions(adminLogin.token),
    ]);

    expect(dashboard.submissionCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(rules)).toBe(true);
    expect(submissions.length).toBeGreaterThanOrEqual(1);
  });
});
