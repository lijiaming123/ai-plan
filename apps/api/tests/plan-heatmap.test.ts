import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    plan: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
  },
}));

import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import {
  buildHeatmapDays,
  parseHeatmapYear,
  weekIndexToDayKeys,
  type HeatmapPlanInput,
} from '../src/modules/me/plan-heatmap.service';

function slotSchedule(
  granularity: 'day' | 'week',
  slots: Array<{ slotKey: string }>
): HeatmapPlanInput['schedule'] {
  return {
    granularity,
    slots: slots.map((s) => ({
      slotKey: s.slotKey,
      generatedContent: '',
      content: '',
      contentSource: 'generated' as const,
    })),
  };
}

describe('plan heatmap weekIndexToDayKeys', () => {
  it('W1 应覆盖起止范围内前 7 天', () => {
    const start = new Date(2026, 3, 1); // 2026-04-01 local
    const end = new Date(2026, 3, 30); // 2026-04-30
    const keys = weekIndexToDayKeys(1, start, end);
    expect(keys).toHaveLength(7);
    expect(keys[0]).toBe('2026-04-01');
    expect(keys[6]).toBe('2026-04-07');
  });

  it('W2 应从第 8 天起', () => {
    const start = new Date(2026, 3, 1);
    const end = new Date(2026, 3, 30);
    const keys = weekIndexToDayKeys(2, start, end);
    expect(keys[0]).toBe('2026-04-08');
  });
});

describe('plan heatmap buildHeatmapDays', () => {
  it('无 schedule 时全年为 none', () => {
    const plans: HeatmapPlanInput[] = [
      {
        planId: 'p1',
        createdAt: new Date(2026, 0, 1),
        deadline: new Date(2026, 11, 31),
        schedule: null,
      },
    ];
    const days = buildHeatmapDays({
      year: 2026,
      plans,
      hasCheckin: () => false,
      todayYmd: '2026-06-15',
    });
    expect(days).toHaveLength(365);
    expect(days.every((d) => d.status === 'none')).toBe(true);
  });

  it('按日槽位：打卡后当日为 completed，未打卡为 missed', () => {
    const plans: HeatmapPlanInput[] = [
      {
        planId: 'p1',
        createdAt: new Date(2026, 5, 1),
        deadline: new Date(2026, 5, 10),
        schedule: slotSchedule('day', [{ slotKey: '2026-06-05' }, { slotKey: '2026-06-06' }]),
      },
    ];
    const days = buildHeatmapDays({
      year: 2026,
      plans,
      hasCheckin: (pid, key) => pid === 'p1' && key === '2026-06-05',
      todayYmd: '2026-06-10',
    });
    const june5 = days.find((d) => d.date === '2026-06-05');
    const june6 = days.find((d) => d.date === '2026-06-06');
    expect(june5?.status).toBe('completed');
    expect(june5?.summary).toEqual({ due: 1, done: 1 });
    expect(june6?.status).toBe('missed');
    expect(june6?.summary).toEqual({ due: 1, done: 0 });
  });

  it('周槽位 W1：任一日展示的需求均为 W1，打卡一次后该周覆盖日均为 completed', () => {
    const plans: HeatmapPlanInput[] = [
      {
        planId: 'p1',
        createdAt: new Date(2026, 3, 1),
        deadline: new Date(2026, 3, 14),
        schedule: slotSchedule('week', [{ slotKey: 'W1' }]),
      },
    ];
    const days = buildHeatmapDays({
      year: 2026,
      plans,
      hasCheckin: (pid, key) => pid === 'p1' && key === 'W1',
      todayYmd: '2026-04-15',
    });
    for (const d of ['2026-04-01', '2026-04-07']) {
      expect(days.find((x) => x.date === d)?.status).toBe('completed');
    }
  });

  it('按日槽位：未到「今天」的应打卡日未打卡应为 pending，非 missed', () => {
    const plans: HeatmapPlanInput[] = [
      {
        planId: 'p1',
        createdAt: new Date(2026, 5, 1),
        deadline: new Date(2026, 5, 10),
        schedule: slotSchedule('day', [{ slotKey: '2026-06-05' }, { slotKey: '2026-06-06' }]),
      },
    ];
    const days = buildHeatmapDays({
      year: 2026,
      plans,
      hasCheckin: () => false,
      todayYmd: '2026-06-04',
    });
    expect(days.find((d) => d.date === '2026-06-05')?.status).toBe('pending');
    expect(days.find((d) => d.date === '2026-06-06')?.status).toBe('pending');
  });

  it('按日槽位：今天未打卡应为 missed，明天仍为 pending', () => {
    const plans: HeatmapPlanInput[] = [
      {
        planId: 'p1',
        createdAt: new Date(2026, 5, 1),
        deadline: new Date(2026, 5, 10),
        schedule: slotSchedule('day', [{ slotKey: '2026-06-05' }, { slotKey: '2026-06-06' }]),
      },
    ];
    const days = buildHeatmapDays({
      year: 2026,
      plans,
      hasCheckin: () => false,
      todayYmd: '2026-06-05',
    });
    expect(days.find((d) => d.date === '2026-06-05')?.status).toBe('missed');
    expect(days.find((d) => d.date === '2026-06-06')?.status).toBe('pending');
  });
});

describe('parseHeatmapYear', () => {
  it('空串使用 fallback', () => {
    expect(parseHeatmapYear(undefined, 2026)).toEqual({ ok: true, year: 2026 });
    expect(parseHeatmapYear('', 2026)).toEqual({ ok: true, year: 2026 });
  });
  it('非法年份失败', () => {
    expect(parseHeatmapYear('1999', 2026).ok).toBe(false);
    expect(parseHeatmapYear('2101', 2026).ok).toBe(false);
    expect(parseHeatmapYear('abc', 2026).ok).toBe(false);
  });
});

describe('GET /me/plan-heatmap', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.mocked(prisma.plan.findMany).mockResolvedValue([]);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([]);
  });

  it('未登录应 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/plan-heatmap' });
    expect(res.statusCode).toBe(401);
  });

  it('登录后应返回当年 days 数组', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const res = await app.inject({
      method: 'GET',
      url: '/me/plan-heatmap?year=2026',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { year: number; days: unknown[]; timeZone: string };
    expect(body.year).toBe(2026);
    expect(body.timeZone).toBe('local');
    expect(body.days).toHaveLength(365);
  });

  it('非法 year 应 400', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const res = await app.inject({
      method: 'GET',
      url: '/me/plan-heatmap?year=1999',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(400);
  });
});
