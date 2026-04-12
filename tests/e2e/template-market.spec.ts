import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../apps/api/src/app';
import { prisma } from '../../apps/api/src/lib/prisma';
import { createApiClient } from '../../apps/web-user/src/lib/api-client';

function createFetchImpl(app: ReturnType<typeof buildApp>) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
    const parsedUrl = new URL(url, 'http://localhost');
    const response = await app.inject({
      method: (init?.method ?? 'GET') as 'GET' | 'POST' | 'DELETE',
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

describe('template market e2e', () => {
  const app = buildApp();
  const slug = 'e2e-template-smoke';

  beforeAll(async () => {
    await app.ready();
    await prisma.presetTemplate.upsert({
      where: { slug },
      create: {
        slug,
        title: 'E2E 预设',
        summary: '端到端测试用预设模板',
        category: 'study',
        tags: ['e2e'],
        locale: 'zh-CN',
        payload: {
          goal: 'E2E 目标',
          deadline: '2026-12-31T00:00:00.000Z',
          requirement: '端到端测试需求描述足够长',
          type: 'study',
        },
        sortOrder: 999,
        isActive: true,
      },
      update: { isActive: true },
    });
  });

  afterAll(async () => {
    await prisma.presetTemplate.deleteMany({ where: { slug } });
    await app.close();
  });

  it('登录后可列出预设并套用生成计划', async () => {
    const api = createApiClient({ fetchImpl: createFetchImpl(app), baseURL: 'http://localhost' });
    const login = await api.login({
      email: 'demo@ai-plan.dev',
      password: 'Pass1234!',
    });

    const presets = await api.listPresets();
    expect(presets.items.some((p) => p.slug === slug)).toBe(true);
    const preset = presets.items.find((p) => p.slug === slug)!;

    const applied = await api.applyPresetTemplate({ id: preset.id, token: login.token });
    expect(applied.planId).toBeTruthy();

    await prisma.plan.deleteMany({ where: { id: applied.planId } });
  });
});
