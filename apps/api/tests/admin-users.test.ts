import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

let dbUp = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}

const describeDb = dbUp ? describe : describe.skip;

describeDb('GET /admin/users', () => {
  const app = buildApp();
  const uid = 'adm_u_story11';

  beforeAll(async () => {
    await app.ready();
    await prisma.telemetryRawEvent.deleteMany({ where: { userId: uid } });
    await prisma.telemetryRawEvent.create({
      data: {
        eventTime: new Date('2026-07-01T08:00:00.000Z'),
        eventName: 'auth_register',
        userId: uid,
        source: 'test',
        platform: 'web',
        clientVersion: '1',
      },
    });
    await prisma.telemetryRawEvent.create({
      data: {
        eventTime: new Date('2026-07-01T09:00:00.000Z'),
        eventName: 'dashboard_view',
        userId: uid,
        source: 'test',
        platform: 'web',
        clientVersion: '1',
      },
    });
  });

  afterAll(async () => {
    await prisma.telemetryRawEvent.deleteMany({ where: { userId: uid } });
    await app.close();
  });

  it('应分页返回并支持按 userId 搜索', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@ai-plan.dev', password: 'Admin1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const list = await app.inject({
      method: 'GET',
      url: `/admin/users?q=${encodeURIComponent('adm_u_story')}&page=1&pageSize=10`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    const body = JSON.parse(list.body) as {
      items: Array<{ userId: string }>;
      total: number;
    };
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.items.some((x) => x.userId === uid)).toBe(true);
  });

  it('详情应返回计数与 Telemetry 摘要', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@ai-plan.dev', password: 'Admin1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const res = await app.inject({
      method: 'GET',
      url: `/admin/users/${encodeURIComponent(uid)}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const detail = JSON.parse(res.body) as {
      userId: string;
      telemetryEventCount: number;
      telemetryTopEvents: Array<{ eventName: string; count: number }>;
      registeredAtApprox: string | null;
    };
    expect(detail.userId).toBe(uid);
    expect(detail.telemetryEventCount).toBe(2);
    expect(detail.registeredAtApprox).toBeTruthy();
    expect(detail.telemetryTopEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('未知用户应 404', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@ai-plan.dev', password: 'Admin1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const res = await app.inject({
      method: 'GET',
      url: '/admin/users/no_such_user_xyz',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
