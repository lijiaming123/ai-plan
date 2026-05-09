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

describeDb('template report & moderation', () => {
  const app = buildApp();
  let userToken = '';
  let adminToken = '';
  let templateId = '';
  let userId = '';
  let phone = '';
  const password = 'TestPass1234!';
  const title = `ReportTarget ${Date.now()}`;

  beforeAll(async () => {
    await app.ready();
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

    const adminLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@ai-plan.dev', password: 'Admin1234!' },
    });
    adminToken = (JSON.parse(adminLogin.body) as { token: string }).token;

    // 创建一个已发布模板作为举报对象
    const pub = await app.inject({
      method: 'POST',
      url: '/templates/market',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        title,
        summary: 'report test',
        category: 'work',
        tags: [],
        payload: {
          goal: 'G',
          deadline: '2026-11-01T00:00:00.000Z',
          requirement: 'R',
          type: 'work',
        },
      },
    });
    expect(pub.statusCode).toBe(201);
    templateId = (JSON.parse(pub.body) as { id: string }).id;
  });

  afterAll(async () => {
    if (templateId) {
      await prisma.marketTemplate.deleteMany({ where: { id: templateId } }).catch(() => {});
    }
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
    }
    await app.close();
  });

  it('用户应可举报模板', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/templates/market/${encodeURIComponent(templateId)}/report`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { reasonCode: 'spam', description: 'looks like spam' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { id: string };
    expect(body.id).toBeTruthy();
  });

  it('管理员应可查看举报列表并下架模板；下架后公开市场不可见', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/admin/templates/reports?pageSize=50',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(list.statusCode).toBe(200);
    const body = JSON.parse(list.body) as { items: Array<{ templateId: string }> };
    expect(body.items.some((x) => x.templateId === templateId)).toBe(true);

    const moderate = await app.inject({
      method: 'POST',
      url: `/admin/templates/${encodeURIComponent(templateId)}/moderate`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { action: 'unpublish', note: 'violation' },
    });
    expect(moderate.statusCode).toBe(200);

    const market = await app.inject({
      method: 'GET',
      url: '/templates/market?pageSize=50',
    });
    expect(market.statusCode).toBe(200);
    const marketBody = JSON.parse(market.body) as { items: Array<{ id: string }> };
    expect(marketBody.items.some((x) => x.id === templateId)).toBe(false);
  });
});

