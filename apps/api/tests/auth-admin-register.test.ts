import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';

describe('POST /auth/admin/register', () => {
  const app = buildApp();
  let prev: string | undefined;

  beforeAll(async () => {
    await app.ready();
    prev = process.env.ADMIN_OPEN_REGISTER;
  });

  afterAll(async () => {
    process.env.ADMIN_OPEN_REGISTER = prev;
    await app.close();
  });

  it('未开放自助注册时应 403', async () => {
    process.env.ADMIN_OPEN_REGISTER = 'false';
    const res = await app.inject({
      method: 'POST',
      url: '/auth/admin/register',
      payload: { email: 'new-admin@test.dev', password: '12345678', preset: 'analyst' },
    });
    expect(res.statusCode).toBe(403);
  });
});
