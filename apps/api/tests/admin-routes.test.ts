import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';

describe('admin routes', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('普通用户读取规则配置时应被拒绝', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const res = await app.inject({
      method: 'GET',
      url: '/admin/rules',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it('管理员应能读取规则配置、总览和提交列表', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@ai-plan.dev', password: 'Admin1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const [rulesRes, dashboardRes, submissionsRes] = await Promise.all([
      app.inject({
        method: 'GET',
        url: '/admin/rules',
        headers: { authorization: `Bearer ${token}` },
      }),
      app.inject({
        method: 'GET',
        url: '/admin/dashboard',
        headers: { authorization: `Bearer ${token}` },
      }),
      app.inject({
        method: 'GET',
        url: '/admin/submissions',
        headers: { authorization: `Bearer ${token}` },
      }),
    ]);

    expect(rulesRes.statusCode).toBe(200);
    expect(dashboardRes.statusCode).toBe(200);
    expect(submissionsRes.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(rulesRes.body))).toBe(true);
    expect(JSON.parse(dashboardRes.body)).toHaveProperty('planCount');
    expect(Array.isArray(JSON.parse(submissionsRes.body))).toBe(true);
  });

  it('管理员缺少 analytics:read 权限时应被拒绝', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'limited-admin@ai-plan.dev', password: 'Limited1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const res = await app.inject({
      method: 'GET',
      url: '/admin/rules',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it('审计日志查询应受 audit:read 权限控制', async () => {
    const okLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@ai-plan.dev', password: 'Admin1234!' },
    });
    const { token: okToken } = JSON.parse(okLogin.body) as { token: string };

    const denyLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'limited-admin@ai-plan.dev', password: 'Limited1234!' },
    });
    const { token: denyToken } = JSON.parse(denyLogin.body) as { token: string };

    const [okRes, denyRes] = await Promise.all([
      app.inject({
        method: 'GET',
        url: '/admin/audit-logs',
        headers: { authorization: `Bearer ${okToken}` },
      }),
      app.inject({
        method: 'GET',
        url: '/admin/audit-logs',
        headers: { authorization: `Bearer ${denyToken}` },
      }),
    ]);

    expect(denyRes.statusCode).toBe(403);
    expect(okRes.statusCode).toBe(200);
    expect(JSON.parse(okRes.body)).toHaveProperty('items');
    expect(Array.isArray(JSON.parse(okRes.body).items)).toBe(true);
  });

  it('最小授权管理员读取用户列表应被拒绝', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'limited-admin@ai-plan.dev', password: 'Limited1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
  });
});
