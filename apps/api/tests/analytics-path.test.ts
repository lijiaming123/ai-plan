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

describeTelemetryDb('GET /analytics/path', () => {
  const app = buildApp();
  const day = '2026-06-15';
  const base = `${day}T10:00:00.000Z`;
  const u1 = 'path_u_session1';
  const u2 = 'path_u_session2';
  const uw = 'path_u_window';
  const sid1 = 'path_sid_1';
  const sid2 = 'path_sid_2';

  beforeAll(async () => {
    await app.ready();
    await prisma.telemetryRawEvent.deleteMany({
      where: { OR: [{ userId: { in: [u1, u2, uw] } }, { sessionId: { in: [sid1, sid2] } }] },
    });

    const t = (minutes: number) => new Date(new Date(base).getTime() + minutes * 60_000);

    await prisma.telemetryRawEvent.createMany({
      data: [
        {
          eventTime: t(0),
          eventName: 'dashboard_view',
          userId: u1,
          sessionId: sid1,
          source: 'path-test',
          platform: 'web',
          clientVersion: '1',
        },
        {
          eventTime: t(1),
          eventName: 'plan_create',
          userId: u1,
          sessionId: sid1,
          source: 'path-test',
          platform: 'web',
          clientVersion: '1',
        },
        {
          eventTime: t(2),
          eventName: 'plan_publish',
          userId: u1,
          sessionId: sid1,
          source: 'path-test',
          platform: 'web',
          clientVersion: '1',
        },
        {
          eventTime: t(10),
          eventName: 'dashboard_view',
          userId: u2,
          sessionId: sid2,
          source: 'path-test',
          platform: 'web',
          clientVersion: '1',
        },
        {
          eventTime: t(11),
          eventName: 'plan_create',
          userId: u2,
          sessionId: sid2,
          source: 'path-test',
          platform: 'web',
          clientVersion: '1',
        },
        {
          eventTime: t(20),
          eventName: 'dashboard_view',
          userId: uw,
          sessionId: null,
          source: 'path-test',
          platform: 'web',
          clientVersion: '1',
        },
        {
          eventTime: t(21),
          eventName: 'plan_create',
          userId: uw,
          sessionId: null,
          source: 'path-test',
          platform: 'web',
          clientVersion: '1',
        },
        {
          eventTime: t(22),
          eventName: 'checkin_submit',
          userId: uw,
          sessionId: null,
          source: 'path-test',
          platform: 'web',
          clientVersion: '1',
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.telemetryRawEvent.deleteMany({
      where: { OR: [{ userId: { in: [u1, u2, uw] } }, { sessionId: { in: [sid1, sid2] } }] },
    });
    await app.close();
  });

  it('应按 session 与短窗口近似返回 Top paths', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@ai-plan.dev', password: 'Admin1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const res = await app.inject({
      method: 'GET',
      url: `/analytics/path?start=${day}&end=${day}&pathLength=3&startEvent=dashboard_view&source=path-test`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      totalPaths: number;
      streamCount: number;
      paths: Array<{ path: string; count: number; share: number }>;
    };
    expect(body.totalPaths).toBe(2);
    expect(body.streamCount).toBe(3);
    expect(body.paths).toHaveLength(2);
    expect(body.paths[0]!.share).toBeCloseTo(0.5);
    expect(body.paths[1]!.share).toBeCloseTo(0.5);
    const set = new Set(body.paths.map((p) => p.path));
    expect(set.has('dashboard_view->plan_create->plan_publish')).toBe(true);
    expect(set.has('dashboard_view->plan_create->checkin_submit')).toBe(true);
  });

  it('非法 startEvent 应 400', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@ai-plan.dev', password: 'Admin1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const res = await app.inject({
      method: 'GET',
      url: `/analytics/path?start=${day}&end=${day}&startEvent=not_an_event`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });
});
