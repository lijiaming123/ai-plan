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

  it('应支持携带profile创建计划', async () => {
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
        goal: '完成健身计划',
        deadline: '2026-12-31T00:00:00.000Z',
        requirement: '每周训练4次，持续3个月',
        type: 'general',
        profile: {
          planMode: 'basic',
          basicInfo: {
            planName: '健身入门',
            planContent: '3个月稳定锻炼并控制饮食',
            currentLevel: 'newbie',
            startDate: '2026-04-10',
            cycle: '3m',
            endDate: '2026-07-10',
            preference: '',
            timeInvestment: '5h_weekly',
            outputMode: 'phase-weekly',
            granularityMode: 'deep',
          },
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as {
      draft?: {
        versions: Array<{
          stages: Array<{
            tasks: Array<{
              timeSlotType?: string;
              timeSlotKey?: string;
              taskType?: string;
            }>;
          }>;
        }>;
      };
    };
    const firstTask = body.draft?.versions[0]?.stages[0]?.tasks[0];
    expect(firstTask?.timeSlotType).toBeDefined();
    expect(firstTask?.timeSlotKey).toBeDefined();
    expect(firstTask?.taskType).toBeDefined();
  });

  it('profile字段不合法时应忽略并继续创建', async () => {
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
        goal: '测试非法profile',
        deadline: '2026-12-31T00:00:00.000Z',
        requirement: '测试',
        type: 'general',
        profile: {
          planMode: 'basic',
          basicInfo: {
            planName: '测试',
            planContent: '测试',
            currentLevel: 'invalid-level',
            startDate: '2026-04-10',
            cycle: '1m',
            endDate: '2026-05-10',
            preference: '',
            timeInvestment: 'none',
            outputMode: 'daily',
          },
        },
      },
    });

    expect(res.statusCode).toBe(201);
  });

  it('应兼容携带generatedPrompt字段的profile', async () => {
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
        goal: '前端',
        deadline: '2026-05-09T00:00:00.000Z',
        requirement: '我想学校前端ai',
        type: 'general',
        profile: {
          generatedPrompt: '你是一名资深 AI 计划顾问与执行教练。',
          planMode: 'basic',
          basicInfo: {
            planName: '前端',
            planContent: '我想学校前端ai',
            currentLevel: 'none',
            startDate: '2026-04-09',
            cycle: '1m',
            endDate: '2026-05-09',
            preference: '',
            timeInvestment: 'none',
            outputMode: 'daily',
          },
        },
      },
    });

    expect(res.statusCode).toBe(201);
  });

  it('应支持AI助手生成计划初稿', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const res = await app.inject({
      method: 'POST',
      url: '/plans/assistant',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        mode: 'draft',
        goal: '完成英语口语训练',
        requirement: '希望拆分每周任务',
        startDate: '2026-04-10',
        cycle: '3m',
        endDate: '2026-07-10',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(
      expect.objectContaining({
        reply: expect.any(String),
        suggestedContent: expect.stringContaining('目标：完成英语口语训练'),
      })
    );
  });

  it('AI助手chat模式缺少message时应返回400', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const res = await app.inject({
      method: 'POST',
      url: '/plans/assistant',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        mode: 'chat',
        goal: '完成英语口语训练',
        requirement: '',
        startDate: '2026-04-10',
        cycle: '1m',
        endDate: '2026-05-10',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual(
      expect.objectContaining({
        message: 'message is required in chat mode',
      })
    );
  });

  it('应支持解析txt计划文件', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };
    const contentBase64 = Buffer.from('文本计划内容').toString('base64');

    const res = await app.inject({
      method: 'POST',
      url: '/plans/parse-file',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fileName: 'plan.txt',
        contentBase64,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(
      expect.objectContaining({
        text: '文本计划内容',
      })
    );
  });

  it('解析不支持的文件格式时应返回400', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };
    const contentBase64 = Buffer.from('binary').toString('base64');

    const res = await app.inject({
      method: 'POST',
      url: '/plans/parse-file',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fileName: 'plan.pdf',
        contentBase64,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual(
      expect.objectContaining({
        message: 'file extension is not supported',
      })
    );
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

  it('应允许携带自定义请求头的OPTIONS预检', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/plans',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,x-requested-with,x-custom-debug',
      },
    });

    expect(res.statusCode).toBeLessThan(400);
  });

  it('应支持同planId下版本递增并最多3版', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const create = await app.inject({
      method: 'POST',
      url: '/plans',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: '版本测试',
        deadline: '2026-11-01T00:00:00.000Z',
        requirement: '初版',
        type: 'general',
      },
    });
    const created = JSON.parse(create.body) as { id: string };

    const regen1 = await app.inject({
      method: 'POST',
      url: `/plans/${created.id}/regenerate`,
      headers: { authorization: `Bearer ${token}` },
      payload: { requirement: '第二版' },
    });
    const regen2 = await app.inject({
      method: 'POST',
      url: `/plans/${created.id}/regenerate`,
      headers: { authorization: `Bearer ${token}` },
      payload: { requirement: '第三版' },
    });
    const regen3 = await app.inject({
      method: 'POST',
      url: `/plans/${created.id}/regenerate`,
      headers: { authorization: `Bearer ${token}` },
      payload: { requirement: '第四版' },
    });

    expect(regen1.statusCode).toBe(200);
    expect(regen2.statusCode).toBe(200);
    expect(regen3.statusCode).toBe(409);
  });

  it('应支持确认指定版本并完成版本比对', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const create = await app.inject({
      method: 'POST',
      url: '/plans',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: '确认测试',
        deadline: '2026-11-01T00:00:00.000Z',
        requirement: '初版',
        type: 'general',
      },
    });
    const created = JSON.parse(create.body) as { id: string };

    await app.inject({
      method: 'POST',
      url: `/plans/${created.id}/regenerate`,
      headers: { authorization: `Bearer ${token}` },
      payload: { requirement: '第二版' },
    });

    const compare = await app.inject({
      method: 'GET',
      url: `/plans/${created.id}/compare?base=1&target=2`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(compare.statusCode).toBe(200);

    const confirm = await app.inject({
      method: 'POST',
      url: `/plans/${created.id}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: { version: 2 },
    });
    expect(confirm.statusCode).toBe(200);
  });

  it('确认版本后计划变为 active 时 GET /plans/:id/draft 应返回 409 且 message 包含 draft is closed', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const create = await app.inject({
      method: 'POST',
      url: '/plans',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: '确认后草稿关闭门禁',
        deadline: '2026-12-01T00:00:00.000Z',
        requirement: '初版',
        type: 'general',
      },
    });
    expect(create.statusCode).toBe(201);
    const created = JSON.parse(create.body) as {
      id: string;
      status: string;
      draft?: { confirmedVersion: number | null };
    };
    expect(created.status).toBe('draft');
    expect(created.draft?.confirmedVersion).toBeNull();

    const confirm = await app.inject({
      method: 'POST',
      url: `/plans/${created.id}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: { version: 1 },
    });
    expect(confirm.statusCode).toBe(200);
    const confirmed = JSON.parse(confirm.body) as {
      plan: { status: string };
      confirmedVersion: number;
    };
    expect(confirmed.plan.status).toBe('active');
    expect(confirmed.confirmedVersion).toBe(1);

    const draftRes = await app.inject({
      method: 'GET',
      url: `/plans/${created.id}/draft`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(draftRes.statusCode).toBe(409);
    const closedBody = JSON.parse(draftRes.body) as { message: string };
    expect(closedBody.message).toContain('draft is closed');
  });
});
