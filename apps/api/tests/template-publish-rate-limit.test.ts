import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';

describe('template publish rate limit', () => {
  const app = buildApp();
  let token = '';
  let userId = '';
  let phone = '';
  const password = 'TestPass1234!';

  beforeAll(async () => {
    await app.ready();
    phone = `13${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`;
    const passwordHash = await bcrypt.hash(password, 6);
    const created = await prisma.user.create({
      data: { phone, passwordHash },
      select: { id: true },
    });
    userId = created.id;
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { phone, password },
    });
    token = (JSON.parse(login.body) as { token: string }).token;
  });

  afterAll(async () => {
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
    }
    await app.close();
  });

  it('连续发布超过阈值应返回 429', async () => {
    const mk = (n: number) => ({
      title: `RateLimit ${Date.now()} ${n}`,
      summary: `s${n}`,
      category: 'work',
      tags: [],
      payload: {
        goal: `G${n}`,
        deadline: '2026-11-01T00:00:00.000Z',
        requirement: `R${n}`,
        type: 'work',
      },
    });

    const results = [];
    for (let i = 0; i < 7; i++) {
      // eslint-disable-next-line no-await-in-loop
      const res = await app.inject({
        method: 'POST',
        url: '/templates/market',
        headers: { authorization: `Bearer ${token}` },
        payload: mk(i),
      });
      results.push(res.statusCode);
    }
    expect(results.some((c) => c === 429)).toBe(true);
  });
});

