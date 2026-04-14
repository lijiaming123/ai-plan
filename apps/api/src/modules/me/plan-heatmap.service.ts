/**
 * 用户「计划完成热力图」按日聚合：已定稿 Plan + 当前版本 schedule + 槽位打卡提交。
 * 周槽位 Wn：按 plan.createdAt～deadline 的起止日历日切分为连续周窗口（与 buildScheduleSlotKeys 的周语义一致）。
 *
 * 打卡提交使用 $queryRaw 读取：避免本地未执行 `prisma generate` 时缺少 `planScheduleSlotSubmission` 委托导致运行时 500。
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { CheckinSchedule } from '../plans/deepseek-schedule';

export type HeatmapDayStatus = 'completed' | 'missed' | 'none';

export type HeatmapDay = {
  date: string;
  status: HeatmapDayStatus;
  summary?: { due: number; done: number };
};

export type PlanHeatmapResponse = {
  year: number;
  timeZone: string;
  days: HeatmapDay[];
};

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function toDateOnlyFromDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 起止包含两端，至少 1 天（与 plan.service 一致） */
function daysBetweenInclusive(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  return Math.max(1, days + 1);
}

function parseWeekIndex1Based(slotKey: string): number | null {
  const m = /^W(\d+)$/i.exec(slotKey.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/**
 * 第 k 周（1-based）覆盖的日历日键列表：从 rangeStart 起第 (k-1)*7 天开始的连续最多 7 天，且不超出 range 总跨度。
 */
export function weekIndexToDayKeys(
  weekIndex1Based: number,
  rangeStart: Date,
  rangeEnd: Date
): string[] {
  const durationDays = daysBetweenInclusive(rangeStart, rangeEnd);
  const startOffset = (weekIndex1Based - 1) * 7;
  if (startOffset >= durationDays) return [];
  const keys: string[] = [];
  for (let i = 0; i < 7 && startOffset + i < durationDays; i += 1) {
    const dt = new Date(rangeStart);
    dt.setDate(rangeStart.getDate() + startOffset + i);
    keys.push(formatDayKey(dt));
  }
  return keys;
}

function* eachYmdInYear(year: number): Generator<string> {
  const d = new Date(year, 0, 1);
  while (d.getFullYear() === year) {
    yield formatDayKey(d);
    d.setDate(d.getDate() + 1);
  }
}

function serializeDue(planId: string, slotKey: string): string {
  return `${planId}\0${slotKey}`;
}

export type HeatmapPlanInput = {
  planId: string;
  createdAt: Date;
  deadline: Date;
  schedule: CheckinSchedule | null;
};

/**
 * 纯函数：生成某年内每日状态，便于单测。
 */
export function buildHeatmapDays(params: {
  year: number;
  plans: HeatmapPlanInput[];
  hasCheckin: (planId: string, slotKey: string) => boolean;
}): HeatmapDay[] {
  const { year, plans, hasCheckin } = params;
  const dueByDate = new Map<string, Set<string>>();

  const addDue = (ymd: string, planId: string, slotKey: string) => {
    if (!ymd.startsWith(`${year}-`)) return;
    const ser = serializeDue(planId, slotKey);
    let set = dueByDate.get(ymd);
    if (!set) {
      set = new Set();
      dueByDate.set(ymd, set);
    }
    set.add(ser);
  };

  for (const plan of plans) {
    if (!plan.schedule?.slots?.length) continue;
    const rangeStart = toDateOnlyFromDate(plan.createdAt);
    const rangeEnd = toDateOnlyFromDate(plan.deadline);
    if (rangeEnd.getTime() < rangeStart.getTime()) continue;

    for (const slot of plan.schedule.slots) {
      const key = slot.slotKey.trim();
      if (!key) continue;

      if (DAY_KEY_RE.test(key)) {
        addDue(key, plan.planId, key);
        continue;
      }

      const wk = parseWeekIndex1Based(key);
      if (wk != null) {
        const dayKeys = weekIndexToDayKeys(wk, rangeStart, rangeEnd);
        for (const ymd of dayKeys) {
          addDue(ymd, plan.planId, key);
        }
      }
    }
  }

  const days: HeatmapDay[] = [];
  for (const date of eachYmdInYear(year)) {
    const dues = dueByDate.get(date);
    if (!dues || dues.size === 0) {
      days.push({ date, status: 'none' });
      continue;
    }
    let done = 0;
    for (const ser of dues) {
      const sep = ser.indexOf('\0');
      const planId = ser.slice(0, sep);
      const slotKey = ser.slice(sep + 1);
      if (hasCheckin(planId, slotKey)) done += 1;
    }
    const due = dues.size;
    const summary = { due, done };
    if (done === due) {
      days.push({ date, status: 'completed', summary });
    } else {
      days.push({ date, status: 'missed', summary });
    }
  }

  return days;
}

async function loadScheduleForPlan(planId: string, version: number): Promise<CheckinSchedule | null> {
  const scheduleRows = (await prisma.$queryRawUnsafe(
    'SELECT schedule FROM "PlanVersion" WHERE "planId" = $1 AND version = $2 LIMIT 1',
    planId,
    version
  )) as Array<{ schedule: unknown | null }>;
  const raw = scheduleRows[0]?.schedule;
  if (!raw || typeof raw !== 'object') return null;
  const schedule = raw as CheckinSchedule;
  if (!Array.isArray(schedule.slots)) return null;
  return schedule;
}

export function parseHeatmapYear(raw: string | undefined, fallbackYear: number): { ok: true; year: number } | { ok: false } {
  if (raw === undefined || raw === '') return { ok: true, year: fallbackYear };
  const y = Number(raw);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) return { ok: false };
  return { ok: true, year: y };
}

/**
 * 从数据库组装热力图（仅已定稿 Plan；schedule 取 confirmedVersion ?? currentVersion）。
 * @param year 已校验的日历年份（2000–2100）
 */
export async function getPlanHeatmapForUser(userId: string, year: number): Promise<PlanHeatmapResponse> {
  const plans = await prisma.plan.findMany({
    where: { userId },
    select: {
      id: true,
      createdAt: true,
      deadline: true,
      confirmedVersion: true,
      currentVersion: true,
    },
  });

  const submissions = await prisma.$queryRaw<Array<{ planId: string; slotKey: string }>>(
    Prisma.sql`SELECT "planId", "slotKey" FROM "PlanScheduleSlotSubmission" WHERE "userId" = ${userId}`,
  );

  const checkinSet = new Set<string>();
  for (const s of submissions) {
    checkinSet.add(serializeDue(s.planId, s.slotKey));
  }

  const hasCheckin = (planId: string, slotKey: string) => checkinSet.has(serializeDue(planId, slotKey));

  const heatmapPlans: HeatmapPlanInput[] = [];
  for (const p of plans) {
    const version = p.confirmedVersion ?? p.currentVersion ?? 1;
    const schedule = await loadScheduleForPlan(p.id, version);
    heatmapPlans.push({
      planId: p.id,
      createdAt: p.createdAt,
      deadline: p.deadline,
      schedule,
    });
  }

  const days = buildHeatmapDays({
    year,
    plans: heatmapPlans,
    hasCheckin,
  });

  return {
    year,
    timeZone: 'local',
    days,
  };
}
