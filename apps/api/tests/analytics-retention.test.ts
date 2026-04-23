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

describeTelemetryDb('GET /analytics/retention', () => {
  const app = buildApp();
  const cohortDay = '2026-05-10';
  const base = `${cohortDay}T12:00:00.000Z`;
  const uidA = 'retention_user_a';
  const uidB = 'retention_user_b';

  beforeAll(async () => {
    await app.ready();
    await prisma.telemetryRawEvent.deleteMany({
      where: { userId: { in: [uidA, uidB] } },
    });

    const t = (dayOffset: number, minute: number) => {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() + dayOffset);
      return new Date(d.getTime() + minute * 60_000);
    };

    await prisma.telemetryRawEvent.createMany({
      data: [
        { eventTime: t(0, 0), eventName: 'auth_register', userId: uidA, source: 'test', platform: 'web', clientVersion: '1' },
        { eventTime: t(0, 1), eventName: 'auth_register', userId: uidB, source: 'test', platform: 'web', clientVersion: '1' },
        { eventTime: t(1, 0), eventName: 'dashboard_view', userId: uidA, source: 'test', platform: 'web', clientVersion: '1' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.telemetryRawEvent.deleteMany({
      where: { userId: { in: [uidA, uidB] } },
    });
    await app.close();
  });

  it('应按注册 cohort 与 D+N 活跃返回留存', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@ai-plan.dev', password: 'Admin1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const res = await app.inject({
      method: 'GET',
      url: `/analytics/retention?cohortStart=${cohortDay}&cohortEnd=${cohortDay}&offsets=1&source=test`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      offsets: number[];
      rows: Array<{
        cohortDay: string;
        cohortSize: number;
        retained: Record<string, { count: number; rate: number }>;
      }>;
    };
    expect(body.offsets).toEqual([1]);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].cohortDay).toBe(cohortDay);
    expect(body.rows[0].cohortSize).toBe(2);
    expect(body.rows[0].retained['1'].count).toBe(1);
    expect(body.rows[0].retained['1'].rate).toBeCloseTo(0.5);
  });
});
