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

describeTelemetryDb('GET /analytics/funnel', () => {
  const app = buildApp();
  const day = '2026-05-01';
  const base = `${day}T12:00:00.000Z`;
  const uidA = 'funnel_user_a';
  const uidB = 'funnel_user_b';

  beforeAll(async () => {
    await app.ready();
    await prisma.telemetryRawEvent.deleteMany({
      where: { userId: { in: [uidA, uidB] } },
    });

    const t = (m: number) => new Date(new Date(base).getTime() + m * 60_000);
    await prisma.telemetryRawEvent.createMany({
      data: [
        { eventTime: t(0), eventName: 'auth_register', userId: uidA, source: 'test', platform: 'web', clientVersion: '1' },
        { eventTime: t(1), eventName: 'plan_create', userId: uidA, source: 'test', platform: 'web', clientVersion: '1' },
        { eventTime: t(2), eventName: 'plan_publish', userId: uidA, source: 'test', platform: 'web', clientVersion: '1' },
        { eventTime: t(3), eventName: 'checkin_submit', userId: uidA, source: 'test', platform: 'web', clientVersion: '1' },
        { eventTime: t(0), eventName: 'auth_register', userId: uidB, source: 'test', platform: 'web', clientVersion: '1' },
        { eventTime: t(1), eventName: 'plan_create', userId: uidB, source: 'test', platform: 'web', clientVersion: '1' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.telemetryRawEvent.deleteMany({
      where: { userId: { in: [uidA, uidB] } },
    });
    await app.close();
  });

  it('应按预置漏斗返回各步人数与转化率', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@ai-plan.dev', password: 'Admin1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const res = await app.inject({
      method: 'GET',
      url: `/analytics/funnel?start=${day}&end=${day}&windowDays=7&source=test`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      steps: Array<{ step: string; count: number; conversionFromPrev: number | null }>;
    };
    expect(body.steps).toHaveLength(4);
    expect(body.steps[0]).toMatchObject({ step: 'auth_register', count: 2, conversionFromPrev: null });
    expect(body.steps[1]).toMatchObject({ step: 'plan_create', count: 2 });
    expect(body.steps[2]).toMatchObject({ step: 'plan_publish', count: 1 });
    expect(body.steps[3]).toMatchObject({ step: 'checkin_submit', count: 1 });
    expect(body.steps[2].conversionFromPrev).toBeCloseTo(0.5);
    expect(body.steps[3].conversionFromPrev).toBe(1);
  });
});
