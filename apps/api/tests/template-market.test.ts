import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';

describe('template market', () => {
  const app = buildApp();
  let token = '';
  let userId = '';
  let planId = '';
  let templateA = '';
  let templateB = '';
  let phone = '';
  const password = 'TestPass1234!';

  beforeAll(async () => {
    await app.ready();
    // 用独立手机号用户隔离其他测试的发布频控/风控计数
    phone = `13${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`;
    const passwordHash = await bcrypt.hash(password, 6);
    const createdUser = await prisma.user.create({
      data: { phone, passwordHash },
      select: { id: true },
    });
    userId = createdUser.id;

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { phone, password },
    });
    token = (JSON.parse(login.body) as { token: string }).token;

    // 保证测试隔离：清理该用户可能残留的市场模板（避免风控计数受历史数据影响）
    const existing = await prisma.marketTemplate.findMany({
      where: { authorId: userId },
      select: { id: true },
    });
    if (existing.length) {
      const ids = existing.map((x) => x.id);
      await prisma.marketTemplateFavorite.deleteMany({ where: { templateId: { in: ids } } });
      await prisma.marketTemplateLike.deleteMany({ where: { templateId: { in: ids } } });
      await prisma.marketTemplate.deleteMany({ where: { id: { in: ids } } });
    }

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
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
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

  it('套用时应绑定 currentPublishedVersionId 并写入 TemplateApplication', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/templates/market/${templateB}/apply`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(201);
    const newId = (JSON.parse(res.body) as { planId: string }).planId;
    expect(newId).toBeTruthy();

    const tpl = await prisma.marketTemplate.findUnique({
      where: { id: templateB },
      select: { currentPublishedVersionId: true },
    });
    expect(tpl?.currentPublishedVersionId).toBeTruthy();

    const appRow = await prisma.templateApplication.findFirst({
      where: { templateId: templateB, planId: newId },
      select: { versionId: true, userId: true },
    });
    expect(appRow?.userId).toBe(userId);
    expect(appRow?.versionId).toBe(tpl?.currentPublishedVersionId);

    await prisma.plan.deleteMany({ where: { id: newId } });
    await prisma.templateApplication.deleteMany({ where: { planId: newId } });
  });

  it('GET /templates/market/:id 应返回预览字段且不返回 payload', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/templates/market/${encodeURIComponent(templateB)}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Record<string, unknown>;
    expect(body.id).toBe(templateB);
    expect(body.preview).toBeTruthy();
    expect(body.payload).toBeUndefined();
    const preview = body.preview as Record<string, unknown>;
    expect(String(preview.goal ?? '')).toContain('Beta');
    expect(String(preview.type ?? '')).toBe('study');
  });

  it('风控命中时发布应进入 pending_review（而不是直接 published）', async () => {
    // v1 风控策略（Story 013 定义）：同一用户在短时间内连续发布多次触发审核
    // 这里用 3 次连续发布来触发（阈值在实现里固定为 2/分钟 → 第 3 次 pending_review）
    const pub1 = await app.inject({
      method: 'POST',
      url: '/templates/market',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: 'Spam 1',
        summary: 's1',
        category: 'work',
        tags: [],
        payload: {
          goal: 'G1',
          deadline: '2026-11-01T00:00:00.000Z',
          requirement: 'R1',
          type: 'work',
        },
      },
    });
    expect(pub1.statusCode).toBe(201);

    const pub2 = await app.inject({
      method: 'POST',
      url: '/templates/market',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: 'Spam 2',
        summary: 's2',
        category: 'work',
        tags: [],
        payload: {
          goal: 'G2',
          deadline: '2026-11-01T00:00:00.000Z',
          requirement: 'R2',
          type: 'work',
        },
      },
    });
    expect(pub2.statusCode).toBe(201);

    const pub3 = await app.inject({
      method: 'POST',
      url: '/templates/market',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: 'Spam 3',
        summary: 's3',
        category: 'work',
        tags: [],
        payload: {
          goal: 'G3',
          deadline: '2026-11-01T00:00:00.000Z',
          requirement: 'R3',
          type: 'work',
        },
      },
    });
    expect(pub3.statusCode).toBe(201);
    const third = JSON.parse(pub3.body) as { id: string };

    const row = await prisma.marketTemplate.findUnique({
      where: { id: third.id },
      select: { status: true },
    });
    expect(row?.status).toBe('pending_review');

    await prisma.marketTemplate.deleteMany({
      where: { id: { in: [JSON.parse(pub1.body).id, JSON.parse(pub2.body).id, third.id] } },
    });
  });
});
