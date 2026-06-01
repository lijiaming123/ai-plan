import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';

let dbUp = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}

const describeDb = dbUp ? describe : describe.skip;

describeDb('admin template review queue', () => {
  const app = buildApp();
  let adminToken = '';
  let userToken = '';
  let pendingTemplateId = '';
  let userId = '';
  let phone = '';
  const password = 'TestPass1234!';

  beforeAll(async () => {
    await app.ready();
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@ai-plan.dev', password: 'Admin1234!' },
    });
    adminToken = (JSON.parse(adminLogin.body) as { token: string }).token;

    // 独立手机号用户，避免与其它模板测试共享风控计数
    phone = `13${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`;
    const passwordHash = await bcrypt.hash(password, 6);
    const created = await prisma.user.create({
      data: { phone, passwordHash },
      select: { id: true },
    });
    userId = created.id;
    const userLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { phone, password },
    });
    userToken = (JSON.parse(userLogin.body) as { token: string }).token;

    // 触发 v1 风控：连续发布第 3 次进入 pending_review
    const mkPayload = (n: number) => ({
      title: `ReviewSpam ${n}`,
      summary: `s${n}`,
      category: 'work',
      tags: [],
      payload: {
        goal: `G${n}`,
        deadline: '2026-11-01T00:00:00.000Z',
        requirement: `R${n}`,
        type: 'work',
      },
    });

    const p1 = await app.inject({
      method: 'POST',
      url: '/templates/market',
      headers: { authorization: `Bearer ${userToken}` },
      payload: mkPayload(1),
    });
    expect(p1.statusCode).toBe(201);

    const p2 = await app.inject({
      method: 'POST',
      url: '/templates/market',
      headers: { authorization: `Bearer ${userToken}` },
      payload: mkPayload(2),
    });
    expect(p2.statusCode).toBe(201);

    const p3 = await app.inject({
      method: 'POST',
      url: '/templates/market',
      headers: { authorization: `Bearer ${userToken}` },
      payload: mkPayload(3),
    });
    expect(p3.statusCode).toBe(201);
    pendingTemplateId = (JSON.parse(p3.body) as { id: string }).id;

    const row = await prisma.marketTemplate.findUnique({
      where: { id: pendingTemplateId },
      select: { status: true },
    });
    expect(row?.status).toBe('pending_review');
  });

  afterAll(async () => {
    await prisma.marketTemplate.deleteMany({
      where: { title: { startsWith: 'ReviewSpam ' } },
    });
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app.close();
  });

  it('GET /admin/templates/review-queue 应返回待审模板', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/templates/review-queue?pageSize=50',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { items: Array<{ id: string; status: string }> };
    expect(body.items.some((x) => x.id === pendingTemplateId && x.status === 'pending_review')).toBe(true);
  });

  it('POST /admin/templates/:id/approve 应发布并写入审核记录', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/templates/${encodeURIComponent(pendingTemplateId)}/approve`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);

    const row = await prisma.marketTemplate.findUnique({
      where: { id: pendingTemplateId },
      select: { status: true, publishedAt: true },
    });
    expect(row?.status).toBe('published');
    expect(row?.publishedAt).toBeTruthy();

    const logs = await prisma.templateReviewLog.findMany({
      where: { templateId: pendingTemplateId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    expect(logs.length).toBe(1);
    expect(logs[0]!.decision).toBe('approve');
  });

  it('approve 后应创建发布版本并回填 currentPublishedVersionId', async () => {
    // 再次 approve（幂等：即使重复调用，至少应确保有 currentPublishedVersionId）
    const res = await app.inject({
      method: 'POST',
      url: `/admin/templates/${encodeURIComponent(pendingTemplateId)}/approve`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);

    // 通过 raw SQL 验证版本表存在且有记录（在 Prisma client 尚未生成新 model 时也能运行）
    const mtRows = (await prisma.$queryRaw`
      SELECT "currentPublishedVersionId"
      FROM "MarketTemplate"
      WHERE id = ${pendingTemplateId}
      LIMIT 1
    `) as Array<{ currentPublishedVersionId: string | null }>;
    expect(mtRows.length).toBe(1);
    expect(mtRows[0]!.currentPublishedVersionId).toBeTruthy();

    const verRows = (await prisma.$queryRaw`
      SELECT COUNT(1)::int AS "cnt"
      FROM "MarketTemplateVersion"
      WHERE "templateId" = ${pendingTemplateId}
    `) as Array<{ cnt: number }>;
    expect(verRows[0]!.cnt).toBeGreaterThanOrEqual(1);
  });
});

