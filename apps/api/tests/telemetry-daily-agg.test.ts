import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

let telemetryDbUp = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  telemetryDbUp = true;
} catch {
  telemetryDbUp = false;
}

const describeTelemetryDb = telemetryDbUp ? describe : describe.skip;

describeTelemetryDb('telemetry daily aggregation', () => {
  const app = buildApp();
  // 选用其他测试不会写入的远未来日期，避免并发测试互相污染（telemetry-ingest 等会写固定 2026-04-22）
  const dayIso = '2099-01-02';

  beforeAll(async () => {
    await app.ready();
    await prisma.telemetryRawEvent.deleteMany({
      where: {
        eventTime: {
          gte: new Date(`${dayIso}T00:00:00.000Z`),
          lte: new Date(`${dayIso}T23:59:59.999Z`),
        },
      },
    });
    await prisma.telemetryDailyAgg.deleteMany({
      where: { day: new Date(`${dayIso}T00:00:00.000Z`) },
    });
  });

  afterAll(async () => {
    await prisma.telemetryRawEvent.deleteMany({
      where: {
        eventTime: {
          gte: new Date(`${dayIso}T00:00:00.000Z`),
          lte: new Date(`${dayIso}T23:59:59.999Z`),
        },
      },
    });
    await prisma.telemetryDailyAgg.deleteMany({
      where: { day: new Date(`${dayIso}T00:00:00.000Z`) },
    });
    await app.close();
  });

  it('空数据日聚合应返回 rows=0', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@ai-plan.dev', password: 'Admin1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const res = await app.inject({
      method: 'POST',
      url: `/admin/telemetry/aggregate-day?day=${dayIso}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { rows: number };
    expect(body.rows).toBe(0);
  });

  it('写入 raw 后聚合应生成 TelemetryDailyAgg', async () => {
    const t0 = new Date(`${dayIso}T10:00:00.000Z`);
    await prisma.telemetryRawEvent.createMany({
      data: [
        {
          eventTime: t0,
          eventName: 'auth_login',
          userId: 'user_demo',
          source: 'a',
          platform: 'web',
          clientVersion: '1',
          properties: { method: 'password' },
        },
        {
          eventTime: t0,
          eventName: 'auth_login',
          userId: 'user_demo',
          source: 'a',
          platform: 'web',
          clientVersion: '1',
          properties: { method: 'password' },
        },
        {
          eventTime: t0,
          eventName: 'dashboard_view',
          userId: null,
          anonymousKey: 'default',
          source: null,
          platform: 'web',
          clientVersion: null,
        },
      ],
    });

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@ai-plan.dev', password: 'Admin1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const res = await app.inject({
      method: 'POST',
      url: `/admin/telemetry/aggregate-day?day=${dayIso}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { rows: number };
    expect(body.rows).toBe(2);

    const rows = await prisma.telemetryDailyAgg.findMany({
      where: { day: new Date(`${dayIso}T00:00:00.000Z`) },
      orderBy: { eventName: 'asc' },
    });
    const loginAgg = rows.find((r) => r.eventName === 'auth_login');
    const dashAgg = rows.find((r) => r.eventName === 'dashboard_view');
    expect(loginAgg?.eventCount).toBe(2);
    expect(loginAgg?.userCount).toBe(1);
    expect(dashAgg?.eventCount).toBe(1);
    expect(dashAgg?.userCount).toBe(0);
  });
});
