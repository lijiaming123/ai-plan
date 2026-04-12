import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

describe('template my market & favorite', () => {
  const app = buildApp();
  let token = '';
  let templateId = '';
  let otherTemplateId = '';

  beforeAll(async () => {
    await app.ready();
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    token = (JSON.parse(login.body) as { token: string }).token;

    const planRes = await app.inject({
      method: 'POST',
      url: '/plans',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: '我的模板列表测试',
        deadline: '2026-10-01T00:00:00.000Z',
        requirement: '测试用计划',
        type: 'work',
      },
    });
    const planId = (JSON.parse(planRes.body) as { id: string }).id;

    const pub = await app.inject({
      method: 'POST',
      url: '/templates/market',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: '我的公开模板',
        summary: '用于测试我的列表',
        category: 'work',
        tags: ['测试'],
        planId,
      },
    });
    templateId = (JSON.parse(pub.body) as { id: string }).id;

    const pub2 = await app.inject({
      method: 'POST',
      url: '/templates/market',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: '第二枚',
        summary: '收藏用',
        category: 'study',
        tags: [],
        payload: {
          goal: 'G',
          deadline: '2026-11-01T00:00:00.000Z',
          requirement: 'R',
          type: 'study',
        },
      },
    });
    otherTemplateId = (JSON.parse(pub2.body) as { id: string }).id;

    await app.inject({
      method: 'POST',
      url: `/templates/market/${otherTemplateId}/favorite`,
      headers: { authorization: `Bearer ${token}` },
    });
    await app.inject({
      method: 'POST',
      url: `/templates/market/${otherTemplateId}/like`,
      headers: { authorization: `Bearer ${token}` },
    });
  });

  afterAll(async () => {
    await prisma.marketTemplateFavorite.deleteMany({
      where: { templateId: { in: [templateId, otherTemplateId] } },
    });
    await prisma.marketTemplateLike.deleteMany({
      where: { templateId: { in: [templateId, otherTemplateId] } },
    });
    await prisma.marketTemplate.deleteMany({
      where: { id: { in: [templateId, otherTemplateId] } },
    });
    await app.close();
  });

  it('GET /templates/my/market?scope=created 应包含本人模板', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/templates/my/market?scope=created',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body) as { items: Array<{ id: string }> };
    expect(data.items.some((i) => i.id === templateId)).toBe(true);
  });

  it('GET /templates/my/market?scope=favorited 应列出收藏', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/templates/my/market?scope=favorited',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body) as { items: Array<{ id: string }> };
    expect(data.items.some((i) => i.id === otherTemplateId)).toBe(true);
  });

  it('GET /templates/market 带 token 应返回 favorited 与 likedByMe', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/templates/market?pageSize=50',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body) as {
      items: Array<{ id: string; favorited?: boolean; likedByMe?: boolean }>;
    };
    const row = data.items.find((i) => i.id === otherTemplateId);
    expect(row?.favorited).toBe(true);
    expect(row?.likedByMe).toBe(true);
  });

  it('DELETE favorite 后 favorited 为 false', async () => {
    const del = await app.inject({
      method: 'DELETE',
      url: `/templates/market/${otherTemplateId}/favorite`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(200);
    const res = await app.inject({
      method: 'GET',
      url: '/templates/market?pageSize=50',
      headers: { authorization: `Bearer ${token}` },
    });
    const data = JSON.parse(res.body) as {
      items: Array<{ id: string; favorited?: boolean }>;
    };
    const row = data.items.find((i) => i.id === otherTemplateId);
    expect(row?.favorited).toBe(false);
  });
});
