import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';

describe('plan schedule edit', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('应允许仅编辑单个 slot 的 content', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const requirementWithJson = [
      '这是计划正文。',
      '```json',
      JSON.stringify(
        {
          schedule: {
            granularity: 'day',
            slots: [
              { slotKey: '2026-04-10', content: '第1天：完成热身与准备。' },
              { slotKey: '2026-04-11', content: '第2天：推进核心任务。' },
              { slotKey: '2026-04-12', content: '第3天：复盘与调整。' },
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
        goal: '测试 schedule 编辑',
        deadline: '2026-04-12T00:00:00.000Z',
        requirement: requirementWithJson,
        type: 'general',
        profile: {
          planMode: 'basic',
          basicInfo: {
            planName: '测试 schedule 编辑',
            planContent: '测试',
            currentLevel: 'none',
            startDate: '2026-04-10',
            cycle: 'custom',
            endDate: '2026-04-12',
            preference: '',
            timeInvestment: 'none',
            outputMode: 'daily',
            granularityMode: 'deep',
          },
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const plan = JSON.parse(created.body) as { id: string; draft?: { versions?: Array<{ schedule?: unknown }> } };
    expect(plan.draft?.versions?.[0]?.schedule).toBeTruthy();

    const patch = await app.inject({
      method: 'PATCH',
      url: `/plans/${plan.id}/schedule/slots/2026-04-11`,
      headers: { authorization: `Bearer ${token}` },
      payload: { content: '第2天：我自己改过的内容。' },
    });
    expect(patch.statusCode).toBe(200);
    const patched = JSON.parse(patch.body) as { slot: { slotKey: string; content: string; contentSource: string } };
    expect(patched.slot.slotKey).toBe('2026-04-11');
    expect(patched.slot.content).toContain('我自己改过');
    expect(patched.slot.contentSource).toBe('edited');

    const fetched = await app.inject({
      method: 'GET',
      url: `/plans/${plan.id}/draft`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(fetched.statusCode).toBe(200);
    const fetchedPlan = JSON.parse(fetched.body) as {
      versions: Array<{ schedule?: { slots?: Array<{ slotKey: string; content: string; contentSource: string }> } }>;
    };
    const slots = fetchedPlan.versions?.[0]?.schedule?.slots ?? [];
    expect(slots.find((s) => s.slotKey === '2026-04-11')?.contentSource).toBe('edited');
  });

  it('应支持恢复为生成内容', async () => {
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
          granularity: 'week',
          slots: [
            { slotKey: 'W1', content: '第1周：生成内容。' },
            { slotKey: 'W2', content: '第2周：生成内容。' },
            { slotKey: 'W3', content: '第3周：生成内容。' },
            { slotKey: 'W4', content: '第4周：生成内容。' },
            { slotKey: 'W5', content: '第5周：生成内容。' },
          ],
        },
      }),
      '```',
    ].join('\n');

    const created = await app.inject({
      method: 'POST',
      url: '/plans',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: '测试恢复生成内容',
        deadline: '2026-04-30T00:00:00.000Z',
        requirement: requirementWithJson,
        type: 'general',
        profile: {
          planMode: 'basic',
          basicInfo: {
            planName: '测试恢复生成内容',
            planContent: '测试',
            currentLevel: 'none',
            startDate: '2026-04-01',
            cycle: 'custom',
            endDate: '2026-04-30',
            preference: '',
            timeInvestment: 'none',
            outputMode: 'daily',
            granularityMode: 'rough',
          },
        },
      },
    });
    const plan = JSON.parse(created.body) as { id: string };

    await app.inject({
      method: 'PATCH',
      url: `/plans/${plan.id}/schedule/slots/W1`,
      headers: { authorization: `Bearer ${token}` },
      payload: { content: '我改过的 W1。' },
    });

    const restore = await app.inject({
      method: 'PATCH',
      url: `/plans/${plan.id}/schedule/slots/W1`,
      headers: { authorization: `Bearer ${token}` },
      payload: { restore: true },
    });
    expect(restore.statusCode).toBe(200);
    const restored = JSON.parse(restore.body) as { slot: { content: string; contentSource: string } };
    expect(restored.slot.contentSource).toBe('generated');
    expect(restored.slot.content).toContain('生成内容');
  });
});

