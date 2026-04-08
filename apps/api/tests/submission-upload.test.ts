import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';

describe('submission upload', () => {
  const app = buildApp();
  const taskId = 'task_1';

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  async function getUserToken() {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    return JSON.parse(login.body).token as string;
  }

  it('应能提交文字与图片证据', async () => {
    const userToken = await getUserToken();
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/submissions`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { content: '完成了第 1 章和第 2 章', imageUrls: ['https://cdn.test/1.png'] },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { images: Array<{ url: string; hash: string }> };
    expect(body.images.length).toBe(1);
    expect(body.images[0].hash).toBeTruthy();
  });

  it('空内容时应拒绝提交', async () => {
    const userToken = await getUserToken();
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/submissions`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { content: '', imageUrls: ['https://cdn.test/1.png'] },
    });

    expect(res.statusCode).toBe(400);
  });

  it('零图片时应拒绝提交', async () => {
    const userToken = await getUserToken();
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/submissions`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { content: '完成了第 1 章和第 2 章', imageUrls: [] },
    });

    expect(res.statusCode).toBe(400);
  });
});
