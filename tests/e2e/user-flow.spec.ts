import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../apps/api/src/app';
import { createApiClient } from '../../apps/web-user/src/lib/api-client';
import { evaluateSubmission } from '../../apps/api/src/modules/evaluation/evaluation.service';

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

describe('user flow smoke', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('用户可以创建计划并提交证据', async () => {
    const api = createApiClient({ fetchImpl: createFetchImpl(app), baseURL: 'http://localhost' });
    const login = await api.login({
      email: 'demo@ai-plan.dev',
      password: 'Pass1234!',
    });

    const plan = await api.createPlan({
      token: login.token,
      goal: '三个月完成作品集',
      deadline: '2026-10-01T00:00:00.000Z',
      requirement: '完成 3 个项目',
      type: 'study',
    });

    expect(plan.id).toBeTruthy();

    const submission = await api.createSubmission({
      taskId: 'task_1',
      token: login.token,
      content: '完成第 1 阶段任务并上传截图',
      imageUrls: ['https://cdn.test/1.png'],
    });

    expect(submission.images.length).toBe(1);

    const evaluation = await evaluateSubmission({ submissionId: submission.id });
    expect(evaluation.status).toBe('completed');
  });
});
