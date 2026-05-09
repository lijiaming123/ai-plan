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

describeDb('template author management', () => {
  const app = buildApp();
  let token = '';
  let userId = '';
  let phone = '';
  const password = 'TestPass1234!';
  let pendingId = '';
  let publishedId = '';

  beforeAll(async () => {
    await app.ready();
    phone = `13${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`;
    const passwordHash = await bcrypt.hash(password, 6);
    const created = await prisma.user.create({
      data: { phone, passwordHash },
      select: { id: true },
    });
    userId = created.id;
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { phone, password },
    });
    token = (JSON.parse(login.body) as { token: string }).token;

    // 发布两次（published），第三次触发 pending_review
    const mk = (n: number) => ({
      title: `AuthorManage ${n}`,
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
      headers: { authorization: `Bearer ${token}` },
      payload: mk(1),
    });
    expect(p1.statusCode).toBe(201);
    publishedId = (JSON.parse(p1.body) as { id: string }).id;

    const p2 = await app.inject({
      method: 'POST',
      url: '/templates/market',
      headers: { authorization: `Bearer ${token}` },
      payload: mk(2),
    });
    expect(p2.statusCode).toBe(201);

    const p3 = await app.inject({
      method: 'POST',
      url: '/templates/market',
      headers: { authorization: `Bearer ${token}` },
      payload: mk(3),
    });
    expect(p3.statusCode).toBe(201);
    pendingId = (JSON.parse(p3.body) as { id: string }).id;
  });

  afterAll(async () => {
    await prisma.marketTemplateLike.deleteMany({ where: { template: { authorId: userId } } });
    await prisma.marketTemplateFavorite.deleteMany({ where: { template: { authorId: userId } } });
    await prisma.templateReport.deleteMany({ where: { template: { authorId: userId } } }).catch(() => {});
    await prisma.templateReviewLog.deleteMany({ where: { template: { authorId: userId } } }).catch(() => {});
    await prisma.marketTemplate.deleteMany({ where: { authorId: userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('created scope 应包含 pending_review 模板并返回 status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/templates/my/market?scope=created&pageSize=50',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { items: Array<{ id: string; status?: string }> };
    const row = body.items.find((x) => x.id === pendingId);
    expect(row).toBeTruthy();
    expect(row?.status).toBe('pending_review');
  });

  it('作者可下架自己的 published 模板', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/templates/market/${encodeURIComponent(publishedId)}/unpublish`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const row = await prisma.marketTemplate.findUnique({
      where: { id: publishedId },
      select: { status: true, publishedAt: true },
    });
    expect(row?.status).toBe('unpublished');
    expect(row?.publishedAt).toBeNull();
  });

  it('作者编辑元信息应触发重新审核（status->pending_review）', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/templates/market/${encodeURIComponent(pendingId)}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Edited title', summary: 'Edited summary', category: 'work', tags: ['x'] },
    });
    expect(res.statusCode).toBe(200);
    const row = await prisma.marketTemplate.findUnique({
      where: { id: pendingId },
      select: { title: true, summary: true, status: true },
    });
    expect(row?.title).toBe('Edited title');
    expect(row?.summary).toBe('Edited summary');
    expect(row?.status).toBe('pending_review');
  });
});

