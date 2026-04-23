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

  it('应将 schedule 内容中的 br 标签规范化为换行', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const rawSlotContent =
      '第1步：准备环境<br>第2步：安装依赖<br/>第3步：验证输出<br />第4步：复盘';
    const normalizedSlotContent =
      '第1步：准备环境\n第2步：安装依赖\n第3步：验证输出\n第4步：复盘';
    const requirementWithJson = [
      '正文',
      '```json',
      JSON.stringify({
        schedule: {
          granularity: 'day',
          slots: [{ slotKey: '2026-04-10', content: rawSlotContent }],
        },
      }),
      '```',
    ].join('\n');

    const created = await app.inject({
      method: 'POST',
      url: '/plans',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: '测试 br 换行规范化',
        deadline: '2026-04-10T00:00:00.000Z',
        requirement: requirementWithJson,
        type: 'general',
        profile: {
          planMode: 'basic',
          basicInfo: {
            planName: '测试 br 换行规范化',
            planContent: '测试',
            currentLevel: 'none',
            startDate: '2026-04-10',
            cycle: 'custom',
            endDate: '2026-04-10',
            preference: '',
            timeInvestment: 'none',
            outputMode: 'daily',
            granularityMode: 'deep',
          },
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const plan = JSON.parse(created.body) as {
      id: string;
      draft?: {
        versions?: Array<{ schedule?: { slots?: Array<{ slotKey: string; content: string }> } }>;
      };
    };

    const createdSlots = plan.draft?.versions?.[0]?.schedule?.slots ?? [];
    expect(createdSlots[0]?.content).toBe(normalizedSlotContent);
    expect(createdSlots[0]?.content.includes('<br')).toBe(false);

    const fetched = await app.inject({
      method: 'GET',
      url: `/plans/${plan.id}/draft`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(fetched.statusCode).toBe(200);
    const fetchedPlan = JSON.parse(fetched.body) as {
      versions: Array<{ schedule?: { slots?: Array<{ slotKey: string; content: string }> } }>;
    };
    const fetchedSlots = fetchedPlan.versions?.[0]?.schedule?.slots ?? [];
    expect(fetchedSlots[0]?.content).toBe(normalizedSlotContent);
    expect(fetchedSlots[0]?.content.includes('<br')).toBe(false);
  });

  it('应支持通过 swap-content 交换两个不同 slotKey 的内容并保持 slotKey 不变', async () => {
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
          slots: [
            { slotKey: '2026-05-01', content: 'A 槽位内容' },
            { slotKey: '2026-05-02', content: 'B 槽位内容' },
            { slotKey: '2026-05-03', content: 'C 槽位内容' },
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
        goal: '测试 swap-content',
        deadline: '2026-05-20T00:00:00.000Z',
        requirement: requirementWithJson,
        type: 'general',
        profile: {
          planMode: 'basic',
          basicInfo: {
            planName: '测试 swap-content',
            planContent: '测试',
            currentLevel: 'none',
            startDate: '2026-05-01',
            cycle: 'custom',
            endDate: '2026-05-20',
            preference: '',
            timeInvestment: 'none',
            outputMode: 'daily',
            granularityMode: 'deep',
          },
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const plan = JSON.parse(created.body) as { id: string };

    const baseline = await app.inject({
      method: 'GET',
      url: `/plans/${plan.id}/draft`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(baseline.statusCode).toBe(200);
    const baselinePlan = JSON.parse(baseline.body) as {
      versions: Array<{ schedule?: { slots?: Array<{ slotKey: string; content: string }> } }>;
    };
    const baselineSlots = baselinePlan.versions?.[0]?.schedule?.slots ?? [];
    const baselineSlotA = baselineSlots.find((s) => s.slotKey === '2026-05-01')?.content;
    const baselineSlotB = baselineSlots.find((s) => s.slotKey === '2026-05-02')?.content;
    expect(baselineSlotA).toBeTruthy();
    expect(baselineSlotB).toBeTruthy();

    const swap = await app.inject({
      method: 'POST',
      url: `/plans/${plan.id}/schedule/slots/swap-content`,
      headers: { authorization: `Bearer ${token}` },
      payload: { slotKeyA: '2026-05-01', slotKeyB: '2026-05-02' },
    });
    expect(swap.statusCode).toBe(200);

    const fetched = await app.inject({
      method: 'GET',
      url: `/plans/${plan.id}/draft`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(fetched.statusCode).toBe(200);
    const fetchedPlan = JSON.parse(fetched.body) as {
      versions: Array<{ schedule?: { slots?: Array<{ slotKey: string; content: string }> } }>;
    };
    const slots = fetchedPlan.versions?.[0]?.schedule?.slots ?? [];
    expect(slots.find((s) => s.slotKey === '2026-05-01')?.content).toBe(baselineSlotB);
    expect(slots.find((s) => s.slotKey === '2026-05-02')?.content).toBe(baselineSlotA);
    expect(slots.find((s) => s.slotKey === '2026-05-01')?.slotKey).toBe('2026-05-01');
    expect(slots.find((s) => s.slotKey === '2026-05-02')?.slotKey).toBe('2026-05-02');
  });

  it('当 swap-content 的两个 slotKey 相同应返回 400 且包含 slot keys must be different', async () => {
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
          slots: [
            { slotKey: '2026-06-01', content: '第1天' },
            { slotKey: '2026-06-02', content: '第2天' },
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
        goal: '测试相同 slotKey 交换',
        deadline: '2026-06-20T00:00:00.000Z',
        requirement: requirementWithJson,
        type: 'general',
        profile: {
          planMode: 'basic',
          basicInfo: {
            planName: '测试相同 slotKey 交换',
            planContent: '测试',
            currentLevel: 'none',
            startDate: '2026-06-01',
            cycle: 'custom',
            endDate: '2026-06-20',
            preference: '',
            timeInvestment: 'none',
            outputMode: 'daily',
            granularityMode: 'deep',
          },
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const plan = JSON.parse(created.body) as { id: string };

    const beforeInvalidSwap = await app.inject({
      method: 'GET',
      url: `/plans/${plan.id}/draft`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(beforeInvalidSwap.statusCode).toBe(200);
    const beforeInvalidSwapPlan = JSON.parse(beforeInvalidSwap.body) as {
      versions: Array<{ schedule?: { slots?: Array<{ slotKey: string; content: string }> } }>;
    };
    const beforeInvalidSwapSlots = beforeInvalidSwapPlan.versions?.[0]?.schedule?.slots ?? [];
    const beforeInvalidA = beforeInvalidSwapSlots.find((s) => s.slotKey === '2026-06-01')?.content;
    const beforeInvalidB = beforeInvalidSwapSlots.find((s) => s.slotKey === '2026-06-02')?.content;
    expect(beforeInvalidA).toBeTruthy();
    expect(beforeInvalidB).toBeTruthy();

    const swap = await app.inject({
      method: 'POST',
      url: `/plans/${plan.id}/schedule/slots/swap-content`,
      headers: { authorization: `Bearer ${token}` },
      payload: { slotKeyA: '2026-06-01', slotKeyB: '2026-06-01' },
    });

    const afterInvalidSwap = await app.inject({
      method: 'GET',
      url: `/plans/${plan.id}/draft`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(afterInvalidSwap.statusCode).toBe(200);
    const afterInvalidSwapPlan = JSON.parse(afterInvalidSwap.body) as {
      versions: Array<{ schedule?: { slots?: Array<{ slotKey: string; content: string }> } }>;
    };
    const afterInvalidSwapSlots = afterInvalidSwapPlan.versions?.[0]?.schedule?.slots ?? [];
    expect(afterInvalidSwapSlots.find((s) => s.slotKey === '2026-06-01')?.content).toBe(beforeInvalidA);
    expect(afterInvalidSwapSlots.find((s) => s.slotKey === '2026-06-02')?.content).toBe(beforeInvalidB);

    expect(swap.statusCode).toBe(400);
    const body = JSON.parse(swap.body) as { message?: string };
    expect(body.message ?? '').toContain('slot keys must be different');
  });

  it('当显式提供非法 version 时应返回 400 且不改变任何 slot 内容', async () => {
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
          slots: [
            { slotKey: '2026-08-01', content: '第1天任务' },
            { slotKey: '2026-08-02', content: '第2天任务' },
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
        goal: '测试非法 version swap-content',
        deadline: '2026-08-20T00:00:00.000Z',
        requirement: requirementWithJson,
        type: 'general',
        profile: {
          planMode: 'basic',
          basicInfo: {
            planName: '测试非法 version swap-content',
            planContent: '测试',
            currentLevel: 'none',
            startDate: '2026-08-01',
            cycle: 'custom',
            endDate: '2026-08-20',
            preference: '',
            timeInvestment: 'none',
            outputMode: 'daily',
            granularityMode: 'deep',
          },
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const plan = JSON.parse(created.body) as { id: string };

    const beforeSwap = await app.inject({
      method: 'GET',
      url: `/plans/${plan.id}/draft`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(beforeSwap.statusCode).toBe(200);
    const beforeSwapPlan = JSON.parse(beforeSwap.body) as {
      versions: Array<{ schedule?: { slots?: Array<{ slotKey: string; content: string }> } }>;
    };
    const beforeSlots = beforeSwapPlan.versions?.[0]?.schedule?.slots ?? [];
    const beforeA = beforeSlots.find((s) => s.slotKey === '2026-08-01')?.content;
    const beforeB = beforeSlots.find((s) => s.slotKey === '2026-08-02')?.content;
    expect(beforeA).toBeTruthy();
    expect(beforeB).toBeTruthy();

    const swap = await app.inject({
      method: 'POST',
      url: `/plans/${plan.id}/schedule/slots/swap-content`,
      headers: { authorization: `Bearer ${token}` },
      payload: { slotKeyA: '2026-08-01', slotKeyB: '2026-08-02', version: 0 },
    });
    expect(swap.statusCode).toBe(400);
    const swapBody = JSON.parse(swap.body) as { message?: string };
    expect(swapBody.message ?? '').toContain('version must be a positive integer');

    const afterSwap = await app.inject({
      method: 'GET',
      url: `/plans/${plan.id}/draft`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(afterSwap.statusCode).toBe(200);
    const afterSwapPlan = JSON.parse(afterSwap.body) as {
      versions: Array<{ schedule?: { slots?: Array<{ slotKey: string; content: string }> } }>;
    };
    const afterSlots = afterSwapPlan.versions?.[0]?.schedule?.slots ?? [];
    expect(afterSlots.find((s) => s.slotKey === '2026-08-01')?.content).toBe(beforeA);
    expect(afterSlots.find((s) => s.slotKey === '2026-08-02')?.content).toBe(beforeB);
  });

  it('多版本草稿在提供 version 时应仅变更该版本的 slot 内容交换', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const requirementV1 = [
      '版本1',
      '```json',
      JSON.stringify({
        schedule: {
          granularity: 'day',
          slots: [
            { slotKey: '2026-07-01', content: 'v1-A' },
            { slotKey: '2026-07-02', content: 'v1-B' },
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
        goal: '测试 swap-content version',
        deadline: '2026-07-20T00:00:00.000Z',
        requirement: requirementV1,
        type: 'general',
        profile: {
          planMode: 'basic',
          basicInfo: {
            planName: '测试 swap-content version',
            planContent: '测试',
            currentLevel: 'none',
            startDate: '2026-07-01',
            cycle: 'custom',
            endDate: '2026-07-20',
            preference: '',
            timeInvestment: 'none',
            outputMode: 'daily',
            granularityMode: 'deep',
          },
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const plan = JSON.parse(created.body) as { id: string };

    const requirementV2 = [
      '版本2',
      '```json',
      JSON.stringify({
        schedule: {
          granularity: 'day',
          slots: [
            { slotKey: '2026-07-01', content: 'v2-A' },
            { slotKey: '2026-07-02', content: 'v2-B' },
          ],
        },
      }),
      '```',
    ].join('\n');

    const regenerated = await app.inject({
      method: 'POST',
      url: `/plans/${plan.id}/regenerate`,
      headers: { authorization: `Bearer ${token}` },
      payload: { requirement: requirementV2 },
    });
    expect(regenerated.statusCode).toBe(200);

    const baseline = await app.inject({
      method: 'GET',
      url: `/plans/${plan.id}/draft`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(baseline.statusCode).toBe(200);
    const baselinePlan = JSON.parse(baseline.body) as {
      versions: Array<{ schedule?: { slots?: Array<{ slotKey: string; content: string }> } }>;
    };
    const baselineV1Slots = baselinePlan.versions?.[0]?.schedule?.slots ?? [];
    const baselineV2Slots = baselinePlan.versions?.[1]?.schedule?.slots ?? [];
    const baselineV1A = baselineV1Slots.find((s) => s.slotKey === '2026-07-01')?.content;
    const baselineV1B = baselineV1Slots.find((s) => s.slotKey === '2026-07-02')?.content;
    const baselineV2A = baselineV2Slots.find((s) => s.slotKey === '2026-07-01')?.content;
    const baselineV2B = baselineV2Slots.find((s) => s.slotKey === '2026-07-02')?.content;
    expect(baselineV1A).toBeTruthy();
    expect(baselineV1B).toBeTruthy();
    expect(baselineV2A).toBeTruthy();
    expect(baselineV2B).toBeTruthy();

    const swap = await app.inject({
      method: 'POST',
      url: `/plans/${plan.id}/schedule/slots/swap-content`,
      headers: { authorization: `Bearer ${token}` },
      payload: { slotKeyA: '2026-07-01', slotKeyB: '2026-07-02', version: 1 },
    });
    expect(swap.statusCode).toBe(200);

    const fetched = await app.inject({
      method: 'GET',
      url: `/plans/${plan.id}/draft`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(fetched.statusCode).toBe(200);
    const fetchedPlan = JSON.parse(fetched.body) as {
      versions: Array<{ schedule?: { slots?: Array<{ slotKey: string; content: string }> } }>;
    };
    const v1Slots = fetchedPlan.versions?.[0]?.schedule?.slots ?? [];
    const v2Slots = fetchedPlan.versions?.[1]?.schedule?.slots ?? [];
    expect(v1Slots.find((s) => s.slotKey === '2026-07-01')?.content).toBe(baselineV1B);
    expect(v1Slots.find((s) => s.slotKey === '2026-07-02')?.content).toBe(baselineV1A);
    expect(v2Slots.find((s) => s.slotKey === '2026-07-01')?.content).toBe(baselineV2A);
    expect(v2Slots.find((s) => s.slotKey === '2026-07-02')?.content).toBe(baselineV2B);
  });
});

