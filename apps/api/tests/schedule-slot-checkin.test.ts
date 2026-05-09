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
        type: 'study',
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
      headers: { authorization: `Bearer ${token}`, 'Idempotency-Key': 'idem_key_1' },
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

  it('同一 Idempotency-Key 重复提交应去重并返回同一条 submission', async () => {
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
            slots: [{ slotKey: '2026-12-01', content: '第1天任务' }],
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
        goal: '幂等测',
        deadline: '2026-12-10T00:00:00.000Z',
        requirement: requirementWithJson,
        type: 'study',
        profile: {
          planMode: 'basic',
          basicInfo: {
            planName: '幂等测',
            planContent: '测',
            currentLevel: 'none',
            startDate: '2026-12-01',
            cycle: 'custom',
            endDate: '2026-12-10',
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

    const idem = 'idem_key_repeat_1';
    const first = await app.inject({
      method: 'POST',
      url: `/plans/${planId}/schedule/slots/2026-12-01/checkins`,
      headers: { authorization: `Bearer ${token}`, 'Idempotency-Key': idem },
      payload: {
        content: '今日已完成',
        attachments: [{ url: 'https://example.com/idem.png', fileName: 'idem.png' }],
      },
    });
    expect(first.statusCode).toBe(201);
    const firstBody = JSON.parse(first.body) as { submission: { id: string } };

    const second = await app.inject({
      method: 'POST',
      url: `/plans/${planId}/schedule/slots/2026-12-01/checkins`,
      headers: { authorization: `Bearer ${token}`, 'Idempotency-Key': idem },
      payload: {
        content: '今日已完成',
        attachments: [{ url: 'https://example.com/idem.png', fileName: 'idem.png' }],
      },
    });
    expect(second.statusCode).toBe(201);
    const secondBody = JSON.parse(second.body) as { submission: { id: string } };
    expect(secondBody.submission.id).toBe(firstBody.submission.id);

    const detail = await app.inject({
      method: 'GET',
      url: `/plans/${planId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.statusCode).toBe(200);
    const plan = JSON.parse(detail.body) as {
      scheduleSlotSubmissions?: Record<string, Array<{ id: string }>>;
    };
    expect(plan.scheduleSlotSubmissions?.['2026-12-01']?.length).toBe(1);
    expect(plan.scheduleSlotSubmissions?.['2026-12-01']?.[0]?.id).toBe(firstBody.submission.id);
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
        type: 'study',
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

  it('未通过核验时应 422 且不写入提交记录', async () => {
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
          slots: [{ slotKey: '2026-08-01', content: '完成阅读与练习' }],
        },
      }),
      '```',
    ].join('\n');

    const create = await app.inject({
      method: 'POST',
      url: '/plans',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: '核验拦截测',
        deadline: '2026-08-10T00:00:00.000Z',
        requirement: requirementWithJson,
        type: 'study',
        profile: {
          planMode: 'basic',
          basicInfo: {
            planName: '核验拦截测',
            planContent: '测',
            currentLevel: 'none',
            startDate: '2026-08-01',
            cycle: 'custom',
            endDate: '2026-08-10',
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
      url: `/plans/${planId}/schedule/slots/2026-08-01/checkins`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: 'ok',
        attachments: [],
      },
    });
    expect(post.statusCode).toBe(422);
    const err = JSON.parse(post.body) as {
      code?: string;
      review?: { passed: boolean; dimensions: unknown[] };
    };
    expect(err.code).toBe('CHECKIN_NOT_PASSED');
    expect(err.review?.passed).toBe(false);
    expect(Array.isArray(err.review?.dimensions)).toBe(true);

    const detail = await app.inject({
      method: 'GET',
      url: `/plans/${planId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const plan = JSON.parse(detail.body) as {
      scheduleSlotSubmissions?: Record<string, unknown[]>;
    };
    expect(plan.scheduleSlotSubmissions?.['2026-08-01']?.length ?? 0).toBe(0);
  });

  it('补交证明通过后应自动关闭该槽 open 申诉', async () => {
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
          slots: [{ slotKey: '2026-12-01', content: '阅读并整理术语' }],
        },
      }),
      '```',
    ].join('\n');

    const create = await app.inject({
      method: 'POST',
      url: '/plans',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: '申诉自动收敛测',
        deadline: '2026-12-10T00:00:00.000Z',
        requirement: requirementWithJson,
        type: 'study',
        profile: {
          planMode: 'basic',
          basicInfo: {
            planName: '申诉自动收敛测',
            planContent: '测',
            currentLevel: 'none',
            startDate: '2026-12-01',
            cycle: 'custom',
            endDate: '2026-12-10',
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

    const appeal = await app.inject({
      method: 'POST',
      url: `/plans/${planId}/schedule/slots/2026-12-01/appeals`,
      headers: { authorization: `Bearer ${token}` },
      payload: { content: '先申诉占位，后续补齐证明。' },
    });
    expect(appeal.statusCode).toBe(201);

    const post = await app.inject({
      method: 'POST',
      url: `/plans/${planId}/schedule/slots/2026-12-01/checkins`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: '已完成阅读并整理要点，见附件。',
        attachments: [{ url: 'https://example.com/proof.png', fileName: 'proof.png' }],
      },
    });
    expect(post.statusCode).toBe(201);

    const detail = await app.inject({
      method: 'GET',
      url: `/plans/${planId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.statusCode).toBe(200);
    const plan = JSON.parse(detail.body) as {
      scheduleSlotOpenAppeals?: Record<string, unknown>;
    };
    expect(plan.scheduleSlotOpenAppeals?.['2026-12-01']).toBeUndefined();
  });

  it('非 travel 计划不允许撤销（DELETE /checkins 应 403 且不修改数据）', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const slotKey = '2026-09-01';
    const requirementWithJson = [
      '学习计划正文。',
      '```json',
      JSON.stringify({
        schedule: {
          granularity: 'day',
          slots: [{ slotKey, content: '学习并完成练习' }],
        },
      }),
      '```',
    ].join('\n');

    const created = await app.inject({
      method: 'POST',
      url: '/plans',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: '非 travel 撤销权限测',
        deadline: '2026-09-10T00:00:00.000Z',
        requirement: requirementWithJson,
        type: 'study',
        profile: {
          planMode: 'basic',
          basicInfo: {
            planName: '非 travel 撤销权限测',
            planContent: '测',
            currentLevel: 'none',
            startDate: slotKey,
            cycle: 'custom',
            endDate: '2026-09-10',
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
      url: `/plans/${planId}/schedule/slots/${slotKey}/checkins`,
      headers: { authorization: `Bearer ${token}`, 'Idempotency-Key': 'idem_key_study_1' },
      payload: {
        content: '已完成学习与练习，见附件。',
        attachments: [{ url: 'https://example.com/study-proof.png', fileName: 'proof.png' }],
      },
    });
    expect(post.statusCode).toBe(201);
    const postBody = JSON.parse(post.body) as { submission: { id: string } };

    const del = await app.inject({
      method: 'DELETE',
      url: `/plans/${planId}/schedule/slots/${slotKey}/checkins`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(403);

    const detailAfterDeleteAttempt = await app.inject({
      method: 'GET',
      url: `/plans/${planId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detailAfterDeleteAttempt.statusCode).toBe(200);
    const planAfterDeleteAttempt = JSON.parse(detailAfterDeleteAttempt.body) as {
      scheduleSlotSubmissions?: Record<string, Array<{ id: string }>>;
    };
    expect(planAfterDeleteAttempt.scheduleSlotSubmissions?.[slotKey]).toHaveLength(1);
    expect(planAfterDeleteAttempt.scheduleSlotSubmissions?.[slotKey]?.[0]?.id).toBe(
      postBody.submission.id,
    );
  });
});
