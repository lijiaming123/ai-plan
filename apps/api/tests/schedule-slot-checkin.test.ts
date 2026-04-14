import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';

describe('schedule slot check-in', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('定稿后应按槽提交证明并在 GET /plans/:id 中返回', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const requirementWithJson = [
      '计划正文。',
      '```json',
      JSON.stringify(
        {
          schedule: {
            granularity: 'day',
            slots: [
              { slotKey: '2026-05-01', content: '第1天任务' },
              { slotKey: '2026-05-02', content: '第2天任务' },
            ],
          },
        },
        null,
        2
      ),
      '```',
    ].join('\n');

    const created = await app.inject({
      method: 'POST',
      url: '/plans',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: '打卡提交测',
        deadline: '2026-05-10T00:00:00.000Z',
        requirement: requirementWithJson,
        type: 'general',
        profile: {
          planMode: 'basic',
          basicInfo: {
            planName: '打卡提交测',
            planContent: '测',
            currentLevel: 'none',
            startDate: '2026-05-01',
            cycle: 'custom',
            endDate: '2026-05-10',
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

    const post = await app.inject({
      method: 'POST',
      url: `/plans/${planId}/schedule/slots/2026-05-01/checkins`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: '今日已完成',
        attachments: [{ url: 'https://example.com/a.png', fileName: '截图.png' }],
      },
    });
    expect(post.statusCode).toBe(201);
    const body = JSON.parse(post.body) as {
      submission: { content: string; attachments: Array<{ url: string; kind: string }> };
    };
    expect(body.submission.content).toContain('已完成');
    expect(body.submission.attachments.length).toBe(1);
    expect(body.submission.attachments[0]?.kind).toBe('image');

    const detail = await app.inject({
      method: 'GET',
      url: `/plans/${planId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.statusCode).toBe(200);
    const plan = JSON.parse(detail.body) as {
      scheduleSlotSubmissions?: Record<string, Array<{ content: string }>>;
    };
    expect(plan.scheduleSlotSubmissions?.['2026-05-01']?.length).toBe(1);
    expect(plan.scheduleSlotSubmissions?.['2026-05-01']?.[0]?.content).toContain('已完成');
  });

  it('无正文且无附件时应 400', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const requirementWithJson = [
      '正文',
      '```json',
      JSON.stringify({
        schedule: {
          granularity: 'day',
          slots: [{ slotKey: '2026-07-01', content: '日任务' }],
        },
      }),
      '```',
    ].join('\n');

    const create = await app.inject({
      method: 'POST',
      url: '/plans',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: '空提交测',
        deadline: '2026-07-10T00:00:00.000Z',
        requirement: requirementWithJson,
        type: 'general',
        profile: {
          planMode: 'basic',
          basicInfo: {
            planName: '空提交测',
            planContent: '测',
            currentLevel: 'none',
            startDate: '2026-07-01',
            cycle: 'custom',
            endDate: '2026-07-10',
            preference: '',
            timeInvestment: 'none',
            outputMode: 'daily',
            granularityMode: 'deep',
          },
        },
      },
    });
    const { id: planId } = JSON.parse(create.body) as { id: string };

    await app.inject({
      method: 'POST',
      url: `/plans/${planId}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: { version: 1 },
    });

    const post = await app.inject({
      method: 'POST',
      url: `/plans/${planId}/schedule/slots/2026-07-01/checkins`,
      headers: { authorization: `Bearer ${token}` },
      payload: { content: '   ', attachments: [] },
    });
    expect(post.statusCode).toBe(400);
  });
});
