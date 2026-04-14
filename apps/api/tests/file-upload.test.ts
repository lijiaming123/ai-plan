import FormData from 'form-data';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';

describe('file upload', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  async function loginToken() {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    return JSON.parse(login.body).token as string;
  }

  it('POST /uploads 应保存文件并可 GET /files 读取', async () => {
    const token = await loginToken();
    const form = new FormData();
    form.append('file', Buffer.from('fake-png-bytes'), {
      filename: 'shot.png',
      contentType: 'image/png',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/uploads',
      headers: {
        authorization: `Bearer ${token}`,
        ...form.getHeaders(),
      },
      payload: form,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { path: string; kind: string };
    expect(body.path).toMatch(/^\/files\/[\da-f-]+\.png$/i);
    expect(body.kind).toBe('image');

    const name = body.path.replace('/files/', '');
    const getFile = await app.inject({ method: 'GET', url: `/files/${name}` });
    expect(getFile.statusCode).toBe(200);
    expect(getFile.body).toContain('fake-png');
  });

  it('未登录 POST /uploads 应 401', async () => {
    const form = new FormData();
    form.append('file', Buffer.from('x'), { filename: 'a.png', contentType: 'image/png' });
    const res = await app.inject({
      method: 'POST',
      url: '/uploads',
      headers: form.getHeaders(),
      payload: form,
    });
    expect(res.statusCode).toBe(401);
  });

  it('不支持的类型应 415', async () => {
    const token = await loginToken();
    const form = new FormData();
    form.append('file', Buffer.from('MZ'), {
      filename: 'x.exe',
      contentType: 'application/octet-stream',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/uploads',
      headers: {
        authorization: `Bearer ${token}`,
        ...form.getHeaders(),
      },
      payload: form,
    });
    expect(res.statusCode).toBe(415);
  });
});
