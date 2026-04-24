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

describe('telemetry ingest auth', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('匿名 key 未提供应 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/events',
      payload: { events: [] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('tracksmith 兼容入口缺少 token 应 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/tracksmith',
      payload: {
        event: 'page_view',
        timestamp: '2026-04-22T00:00:00.000Z',
        page: '/plans',
      },
    });
    expect(res.statusCode).toBe(401);
  });
});

describeTelemetryDb('telemetry ingest', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('匿名 key 正确应接收并统计 dropped', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/events',
      headers: { 'x-telemetry-key': 'dev-telemetry-key' },
      payload: {
        events: [
          { name: 'auth_login', time: '2026-04-22T00:00:00.000Z', properties: { method: 'password' } },
          { name: 'unknown', time: '2026-04-22T00:00:00.000Z' },
          { name: 'auth_login', time: 'bad-time' },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      accepted: number;
      dropped: number;
      reasonCounts: Record<string, number>;
    };
    expect(body.accepted).toBe(1);
    expect(body.dropped).toBe(2);
    expect(body.reasonCounts.INVALID_EVENT).toBe(1);
    expect(body.reasonCounts.INVALID_TIME).toBe(1);
  });

  it('携带用户 token 也应允许上报', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/events',
      headers: { authorization: `Bearer ${token}` },
      payload: { events: [{ name: 'dashboard_view', time: '2026-04-22T00:00:00.000Z' }] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { accepted: number; dropped: number };
    expect(body.accepted).toBe(1);
    expect(body.dropped).toBe(0);
  });

  it('accepted events 应写入 TelemetryRawEvent', async () => {
    const before = await prisma.telemetryRawEvent.count();
    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/events',
      headers: {
        'x-telemetry-key': 'dev-telemetry-key',
        'x-platform': 'web',
        'x-client-version': '1.0.0-test',
        'x-telemetry-source': 'vitest',
      },
      payload: {
        events: [
          { name: 'auth_login', time: '2026-04-22T12:00:00.000Z', properties: { method: 'password' } },
          { name: 'dashboard_view', time: '2026-04-22T12:00:01.000Z', page: '/overview' },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { accepted: number };
    expect(body.accepted).toBe(2);
    const after = await prisma.telemetryRawEvent.count();
    expect(after - before).toBe(2);

    const last = await prisma.telemetryRawEvent.findFirst({
      where: { eventName: 'dashboard_view', page: '/overview' },
      orderBy: { receivedAt: 'desc' },
    });
    expect(last).toBeTruthy();
    expect(last?.platform).toBe('web');
    expect(last?.clientVersion).toBe('1.0.0-test');
    expect(last?.source).toBe('vitest');
    expect(last?.anonymousKey).toBe('default');
    expect(last?.userId).toBeNull();
  });

  it('tracksmith 单事件 payload 应转换后写入 TelemetryRawEvent', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };
    const before = await prisma.telemetryRawEvent.count();

    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/tracksmith',
      payload: {
        token,
        event: 'page_view',
        timestamp: '2026-04-22T12:34:56.000Z',
        page: '/notifications',
        sessionId: 'session-tracksmith-1',
        source: 'web-user',
        platform: 'web',
        clientVersion: '1.0.0-test',
        properties: {
          route: '/notifications',
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { accepted: number; dropped: number };
    expect(body.accepted).toBe(1);
    expect(body.dropped).toBe(0);

    const after = await prisma.telemetryRawEvent.count();
    expect(after - before).toBe(1);

    const last = await prisma.telemetryRawEvent.findFirst({
      where: { eventName: 'page_view', page: '/notifications' },
      orderBy: { receivedAt: 'desc' },
    });
    expect(last).toBeTruthy();
    expect(last?.userId).toBe('user_demo');
    expect(last?.sessionId).toBe('session-tracksmith-1');
    expect(last?.platform).toBe('web');
    expect(last?.source).toBe('web-user');
    expect(last?.clientVersion).toBe('1.0.0-test');
    expect(last?.properties).toMatchObject({ route: '/notifications' });
  });
});
