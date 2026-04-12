import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

describe('template presets', () => {
  const app = buildApp();
  let presetId = '';

  beforeAll(async () => {
    await app.ready();
    const p = await prisma.presetTemplate.findFirst({
      where: { slug: 'preset-study-exam-12w' },
    });
    presetId = p?.id ?? '';
    if (!presetId) {
      const created = await prisma.presetTemplate.create({
        data: {
          slug: `test-preset-${Date.now()}`,
          title: '测试预设',
          summary: '测试',
          category: 'study',
          tags: ['测试'],
          locale: 'zh-CN',
          payload: {
            goal: '测试目标',
            deadline: '2026-12-31T00:00:00.000Z',
            requirement: '测试需求内容足够长',
            type: 'study',
          },
          sortOrder: 0,
          isActive: true,
        },
      });
      presetId = created.id;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /templates/presets 应返回列表', async () => {
    const res = await app.inject({ method: 'GET', url: '/templates/presets' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { items: Array<{ id: string }> };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
  });

  it('未登录套用预设应 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/templates/presets/${presetId}/apply`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('登录后套用预设应返回 planId', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const res = await app.inject({
      method: 'POST',
      url: `/templates/presets/${presetId}/apply`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { planId: string };
    expect(body.planId).toBeTruthy();
  });
});
