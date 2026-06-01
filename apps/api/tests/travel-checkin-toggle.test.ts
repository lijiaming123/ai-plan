import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';

describe('travel checkin toggle', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('travel: empty POST creates a completion, DELETE hides it from plan detail, and POST can complete again', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    expect(login.statusCode).toBe(200);
    const { token } = JSON.parse(login.body) as { token: string };

    const slotKey = '2026-05-09';
    const requirementWithJson = [
      '旅行计划正文。',
      '```json',
      JSON.stringify(
        {
          schedule: {
            granularity: 'day',
            slots: [{ slotKey, content: '抵达目的地并完成首日行程' }],
          },
        },
        null,
        2,
      ),
      '```',
    ].join('\n');

    const created = await app.inject({
      method: 'POST',
      url: '/plans',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: '旅游打卡撤销测',
        deadline: '2026-05-12T00:00:00.000Z',
        requirement: requirementWithJson,
        type: 'travel',
        profile: {
          planMode: 'basic',
          basicInfo: {
            planName: '旅游打卡撤销测',
            planContent: '测',
            currentLevel: 'none',
            startDate: slotKey,
            cycle: 'custom',
            endDate: '2026-05-12',
            preference: '',
            timeInvestment: 'none',
            outputMode: 'daily',
            granularityMode: 'deep',
          },
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const { id: planId } = JSON.parse(created.body) as { id: string };

    const confirm = await app.inject({
      method: 'POST',
      url: `/plans/${planId}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: { version: 1 },
    });
    expect(confirm.statusCode).toBe(200);

    const firstPost = await app.inject({
      method: 'POST',
      url: `/plans/${planId}/schedule/slots/${slotKey}/checkins`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(firstPost.statusCode).toBe(201);
    const firstBody = JSON.parse(firstPost.body) as { submission: { id: string; content: string } };
    expect(firstBody.submission.content).toBe('');

    const detailAfterPost = await app.inject({
      method: 'GET',
      url: `/plans/${planId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detailAfterPost.statusCode).toBe(200);
    const planAfterPost = JSON.parse(detailAfterPost.body) as {
      scheduleSlotSubmissions?: Record<string, Array<{ id: string }>>;
    };
    expect(planAfterPost.scheduleSlotSubmissions?.[slotKey]).toHaveLength(1);
    expect(planAfterPost.scheduleSlotSubmissions?.[slotKey]?.[0]?.id).toBe(firstBody.submission.id);

    const del = await app.inject({
      method: 'DELETE',
      url: `/plans/${planId}/schedule/slots/${slotKey}/checkins`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(200);
    expect(JSON.parse(del.body)).toEqual({ ok: true });

    const detailAfterDelete = await app.inject({
      method: 'GET',
      url: `/plans/${planId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detailAfterDelete.statusCode).toBe(200);
    const planAfterDelete = JSON.parse(detailAfterDelete.body) as {
      scheduleSlotSubmissions?: Record<string, Array<{ id: string }>>;
    };
    expect(planAfterDelete.scheduleSlotSubmissions?.[slotKey] ?? []).toHaveLength(0);

    const secondPost = await app.inject({
      method: 'POST',
      url: `/plans/${planId}/schedule/slots/${slotKey}/checkins`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(secondPost.statusCode).toBe(201);
    const secondBody = JSON.parse(secondPost.body) as { submission: { id: string } };
    expect(secondBody.submission.id).not.toBe(firstBody.submission.id);

    const detailAfterSecondPost = await app.inject({
      method: 'GET',
      url: `/plans/${planId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detailAfterSecondPost.statusCode).toBe(200);
    const planAfterSecondPost = JSON.parse(detailAfterSecondPost.body) as {
      scheduleSlotSubmissions?: Record<string, Array<{ id: string }>>;
    };
    expect(planAfterSecondPost.scheduleSlotSubmissions?.[slotKey]).toHaveLength(1);
    expect(planAfterSecondPost.scheduleSlotSubmissions?.[slotKey]?.[0]?.id).toBe(
      secondBody.submission.id,
    );
  });

  it('travel: POST with same Idempotency-Key should stay idempotent even after DELETE (closedAt != null)', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    expect(login.statusCode).toBe(200);
    const { token } = JSON.parse(login.body) as { token: string };

    const slotKey = '2026-05-10';
    const requirementWithJson = [
      '旅行计划正文。',
      '```json',
      JSON.stringify(
        {
          schedule: {
            granularity: 'day',
            slots: [{ slotKey, content: '打卡幂等回归测' }],
          },
        },
        null,
        2,
      ),
      '```',
    ].join('\n');

    const created = await app.inject({
      method: 'POST',
      url: '/plans',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: '旅游打卡幂等撤销回归测',
        deadline: '2026-05-12T00:00:00.000Z',
        requirement: requirementWithJson,
        type: 'travel',
        profile: {
          planMode: 'basic',
          basicInfo: {
            planName: '旅游打卡幂等撤销回归测',
            planContent: '测',
            currentLevel: 'none',
            startDate: slotKey,
            cycle: 'custom',
            endDate: '2026-05-12',
            preference: '',
            timeInvestment: 'none',
            outputMode: 'daily',
            granularityMode: 'deep',
          },
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const { id: planId } = JSON.parse(created.body) as { id: string };

    const confirm = await app.inject({
      method: 'POST',
      url: `/plans/${planId}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: { version: 1 },
    });
    expect(confirm.statusCode).toBe(200);

    const idem = 'idem_key_travel_delete_1';
    const firstPost = await app.inject({
      method: 'POST',
      url: `/plans/${planId}/schedule/slots/${slotKey}/checkins`,
      headers: { authorization: `Bearer ${token}`, 'Idempotency-Key': idem },
      payload: {},
    });
    expect(firstPost.statusCode).toBe(201);
    const firstBody = JSON.parse(firstPost.body) as { submission: { id: string } };

    const del = await app.inject({
      method: 'DELETE',
      url: `/plans/${planId}/schedule/slots/${slotKey}/checkins`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(200);
    expect(JSON.parse(del.body)).toEqual({ ok: true });

    const secondPost = await app.inject({
      method: 'POST',
      url: `/plans/${planId}/schedule/slots/${slotKey}/checkins`,
      headers: { authorization: `Bearer ${token}`, 'Idempotency-Key': idem },
      payload: {},
    });
    expect(secondPost.statusCode).toBe(201);
    const secondBody = JSON.parse(secondPost.body) as { submission: { id: string } };
    expect(secondBody.submission.id).toBe(firstBody.submission.id);
  });
});
