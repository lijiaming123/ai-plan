import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

describe('template market', () => {
  const app = buildApp();
  let token = '';
  let userId = '';
  let planId = '';
  let templateA = '';
  let templateB = '';

  beforeAll(async () => {
    await app.ready();
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    const body = JSON.parse(login.body) as { token: string };
    token = body.token;
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    userId = (JSON.parse(me.body) as { userId: string }).userId;

    const planRes = await app.inject({
      method: 'POST',
      url: '/plans',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: '市场模板测试计划',
        deadline: '2026-10-01T00:00:00.000Z',
        requirement: '用于发布到模板市场的测试计划',
        type: 'work',
      },
    });
    planId = (JSON.parse(planRes.body) as { id: string }).id;

    const pubA = await app.inject({
      method: 'POST',
      url: '/templates/market',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: 'Alpha 工作模板',
        summary: '关键词 alpha 独有',
        category: 'work',
        tags: ['alpha', '交付'],
        planId,
      },
    });
    expect(pubA.statusCode).toBe(201);
    templateA = (JSON.parse(pubA.body) as { id: string }).id;

    const pubB = await app.inject({
      method: 'POST',
      url: '/templates/market',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: 'Beta 学习模板',
        summary: 'beta 模板描述',
        category: 'study',
        tags: ['beta'],
        payload: {
          goal: 'Beta 目标',
          deadline: '2026-11-01T00:00:00.000Z',
          requirement: 'Beta 需求内容用于测试',
          type: 'study',
        },
      },
    });
    expect(pubB.statusCode).toBe(201);
    templateB = (JSON.parse(pubB.body) as { id: string }).id;

    await prisma.marketTemplate.update({
      where: { id: templateB },
      data: { likeCount: 5 },
    });
  });

  afterAll(async () => {
    await prisma.marketTemplateLike.deleteMany({
      where: { templateId: { in: [templateA, templateB] } },
    });
    await prisma.marketTemplate.deleteMany({
      where: { id: { in: [templateA, templateB] } },
    });
    if (planId) {
      await prisma.plan.deleteMany({ where: { id: planId } });
    }
    await app.close();
  });

  it('GET /templates/market 非法 sort 应 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/templates/market?sort=hot',
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /templates/market 应支持关键词搜索', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/templates/market?q=alpha',
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body) as { items: Array<{ id: string; title: string }> };
    expect(data.items.some((i) => i.id === templateA)).toBe(true);
  });

  it('GET /templates/market sort=likes 应优先高赞', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/templates/market?sort=likes&pageSize=50',
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body) as { items: Array<{ id: string }> };
    const idxA = data.items.findIndex((i) => i.id === templateA);
    const idxB = data.items.findIndex((i) => i.id === templateB);
    expect(idxB).toBeGreaterThanOrEqual(0);
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxB).toBeLessThan(idxA);
  });

  it('点赞应幂等且不重复累加', async () => {
    const r1 = await app.inject({
      method: 'POST',
      url: `/templates/market/${templateA}/like`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r1.statusCode).toBe(200);
    const c1 = (JSON.parse(r1.body) as { likeCount: number }).likeCount;

    const r2 = await app.inject({
      method: 'POST',
      url: `/templates/market/${templateA}/like`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r2.statusCode).toBe(200);
    const c2 = (JSON.parse(r2.body) as { likeCount: number }).likeCount;
    expect(c2).toBe(c1);
  });

  it('套用市场模板应创建新计划', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/templates/market/${templateB}/apply`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(201);
    const newId = (JSON.parse(res.body) as { planId: string }).planId;
    expect(newId).toBeTruthy();
    await prisma.plan.deleteMany({ where: { id: newId } });
  });
});
