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

describeDb('admin accounts API', () => {
  const app = buildApp();
  const loginId = `ops_${Date.now()}`;

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await prisma.adminUser.deleteMany({ where: { loginId } });
    await app.close();
  });

  async function superAdminToken() {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@ai-plan.dev', password: 'Admin1234!' },
    });
    return (JSON.parse(login.body) as { token: string }).token;
  }

  it('无 rbac:manage 时列表 403', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'limited-admin@ai-plan.dev', password: 'Limited1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };
    const res = await app.inject({
      method: 'GET',
      url: '/admin/admin-users',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('超管可创建 analyst 账号', async () => {
    const token = await superAdminToken();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/admin-users',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        loginId,
        email: `${loginId}@test.dev`,
        password: 'TempPass123!',
        presetKey: 'analyst',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { loginId: string; permissions: string[] };
    expect(body.loginId).toBe(loginId);
    expect(body.permissions).toContain('analytics:export');
    expect(body.permissions).not.toContain('rbac:manage');
  });

  it('禁用账号无法登录', async () => {
    const token = await superAdminToken();
    const list = await app.inject({
      method: 'GET',
      url: '/admin/admin-users',
      headers: { authorization: `Bearer ${token}` },
    });
    const items = (JSON.parse(list.body) as { items: Array<{ id: string; loginId: string }> }).items;
    const row = items.find((x) => x.loginId === loginId);
    expect(row).toBeTruthy();

    const patch = await app.inject({
      method: 'PATCH',
      url: `/admin/admin-users/${row!.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { disabled: true },
    });
    expect(patch.statusCode).toBe(200);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: loginId, password: 'TempPass123!' },
    });
    expect(login.statusCode).toBe(401);
  });
});

describe('GET /auth/admin/register-open', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('默认未开放', async () => {
    const prev = process.env.ADMIN_OPEN_REGISTER;
    process.env.ADMIN_OPEN_REGISTER = 'false';
    const res = await app.inject({ method: 'GET', url: '/auth/admin/register-open' });
    process.env.ADMIN_OPEN_REGISTER = prev;
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ open: false });
  });
});
