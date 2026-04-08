import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { sanitizePlanPatch } from '../src/modules/plans/plan.service';

describe('plan generation', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('应能创建带阶段和任务的计划', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const res = await app.inject({
      method: 'POST',
      url: '/plans',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: '通过英语考试',
        deadline: '2026-10-01T00:00:00.000Z',
        requirement: 'IELTS 7.0',
        type: 'study',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { stages: Array<{ tasks: unknown[] }> };
    expect(body.stages.length).toBeGreaterThan(0);
    expect(body.stages[0].tasks.length).toBeGreaterThan(0);
  });

  it('仅允许有限字段参与计划编辑', () => {
    expect(
      sanitizePlanPatch({
        deadline: '2026-10-02T00:00:00.000Z',
        note: '调整节奏',
        goal: '不应保留',
        status: 'completed',
      })
    ).toEqual({
      deadline: '2026-10-02T00:00:00.000Z',
      note: '调整节奏',
    });
  });
});
