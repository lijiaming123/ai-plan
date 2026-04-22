import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';

describe('telemetry ingest', () => {
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
});

