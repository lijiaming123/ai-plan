import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';

let lastDeepseekMessages:
  | Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  | null = null;

vi.mock('../src/lib/deepseek', () => {
  return {
    isDeepseekConfigured: () => true,
    streamDeepseekChat: async function* () {
      // 本测试不覆盖 stream 路径；保底给空输出，避免意外调用时报错
    },
    completeDeepseekChat: vi.fn(
      async (
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
      ) => {
        lastDeepseekMessages = messages;
        const user = messages.find((m) => m.role === 'user')?.content ?? '';
        const travelOn = user.includes('行程化输出要求') || user.includes('行程安排');

        const slotContent = travelOn
          ? '上午：景点A→景点B（交通：地铁，通勤约25分钟）；午餐后前往景点C（打车约15分钟）。提醒：门票/预约与营业时间请提前确认。备选：如遇雨改为室内博物馆。拍照：在观景台留一张全景照。'
          : '本期计划：完成1个可验证动作。';

        return [
          '正文（mock）',
          '```json',
          JSON.stringify({
            schedule: {
              granularity: 'day',
              slots: [{ slotKey: '2026-04-10', content: slotContent }],
            },
          }),
          '```',
        ].join('\n');
      },
    ),
  };
});

describe('travel prompt branch', () => {
  let app: Awaited<ReturnType<(typeof import('../src/app'))['buildApp']>> | null =
    null;

  beforeAll(async () => {
    // 重要：在 mock 之后再 import，确保路由层读取到 mock 的 deepseek 实现
    const { buildApp } = await import('../src/app');
    app = buildApp();
    await app.ready();
  }, 30000);

  afterAll(async () => {
    await app?.close();
    app = null;
  });

  it('创建 travel 计划时，应走行程化 schedule slot.content', async () => {
    if (!app) throw new Error('app not ready');
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
        goal: '东京三日游',
        requirement: 'type=travel\n想要行程攻略：景点路线+交通+预约提醒+备选方案',
        startDate: '2026-04-10',
        cycle: 'custom',
        endDate: '2026-04-10',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      schedule?: { slots?: Array<{ content: string }> };
    };
    const content = body.schedule?.slots?.[0]?.content ?? '';
    expect(content).toMatch(/交通|通勤|预约|备选|拍照/);

    expect(lastDeepseekMessages?.[0]?.role).toBe('system');
    expect(lastDeepseekMessages?.[0]?.content).toMatch(/旅行行程规划师/);
  });
});

