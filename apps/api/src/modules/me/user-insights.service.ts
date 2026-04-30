/**
 * 用户统计分析聚合（GET /me/insights）。
 *
 * 口径说明（MVP）：
 * - 进行中计划：已定稿 Plan，且未删除、未归档。
 * - 本周完成任务：本周一 00:00（本地时区）起至下周一 00:00 前创建的打卡提交条数（按提交次数计，非去重槽位）。
 * - 平均进度：仅统计「有打卡表且槽位数 > 0」的进行中计划；单计划进度 = 至少有一条提交的槽位数 / 总槽位数；再对多计划取算术平均（0–100 整数百分比）。
 * - 近 12 周打卡趋势：每周历周（本地周一为界）内提交总数，数组从旧到新（末元素为当前周）。
 */
import { prisma } from "../../lib/prisma";
import type { CheckinSchedule } from "../plans/deepseek-schedule";

export type UserInsightsResponse = {
  activePlans: number;
  weekCheckinsCompleted: number;
  avgProgressPercent: number;
  /** 近 12 周每周打卡提交数，旧→新 */
  weeklyCheckinTrend: number[];
  weekRangeLabel: string;
};

function mondayStartLocal(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const off = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + off);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** 当前日历周 [monday, nextMonday) 本地 */
function currentWeekRangeLocal(ref: Date): { start: Date; endExclusive: Date } {
  const start = mondayStartLocal(ref);
  const endExclusive = new Date(start);
  endExclusive.setDate(start.getDate() + 7);
  return { start, endExclusive };
}

function formatWeekRangeLabel(start: Date, endExclusive: Date): string {
  const fmt = (t: Date) =>
    `${t.getMonth() + 1}/${t.getDate()}`;
  const endDay = new Date(endExclusive);
  endDay.setDate(endDay.getDate() - 1);
  return `${fmt(start)}–${fmt(endDay)}`;
}

async function loadScheduleForPlanVersion(
  planId: string,
  version: number,
): Promise<CheckinSchedule | null> {
  const scheduleRows = (await prisma.$queryRawUnsafe(
    'SELECT schedule FROM "PlanVersion" WHERE "planId" = $1 AND version = $2 LIMIT 1',
    planId,
    version,
  )) as Array<{ schedule: unknown | null }>;
  const raw = scheduleRows[0]?.schedule;
  if (!raw || typeof raw !== "object") return null;
  const schedule = raw as CheckinSchedule;
  if (!Array.isArray(schedule.slots)) return null;
  return schedule;
}

/** @internal exported for unit tests */
export function buildWeeklyTrendLocal(
  timestamps: Date[],
  ref: Date,
  numWeeks: number,
): number[] {
  const counts = Array.from({ length: numWeeks }, () => 0);
  const currentMonday = mondayStartLocal(ref);
  const oldestMonday = new Date(currentMonday);
  oldestMonday.setDate(currentMonday.getDate() - 7 * (numWeeks - 1));

  for (const ts of timestamps) {
    const m = mondayStartLocal(ts);
    const diffMs = m.getTime() - oldestMonday.getTime();
    if (diffMs < 0) continue;
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const idx = Math.floor(diffMs / weekMs + 1e-6);
    if (idx >= 0 && idx < numWeeks) counts[idx] += 1;
  }
  return counts;
}

export async function getUserInsights(userId: string): Promise<UserInsightsResponse> {
  const now = new Date();
  const { start: weekStart, endExclusive: weekEnd } = currentWeekRangeLocal(now);
  const weekRangeLabel = formatWeekRangeLabel(weekStart, weekEnd);

  const activeWhere = {
    userId,
    deletedAt: null as Date | null,
    archivedAt: null as Date | null,
  };

  const [activePlans, weekCount, plans] = await Promise.all([
    prisma.plan.count({ where: activeWhere }),
    prisma.planScheduleSlotSubmission.count({
      where: {
        userId,
        createdAt: { gte: weekStart, lt: weekEnd },
      },
    }),
    prisma.plan.findMany({
      where: activeWhere,
      select: {
        id: true,
        confirmedVersion: true,
        currentVersion: true,
      },
    }),
  ]);

  const planIds = plans.map((p) => p.id);
  let avgProgressPercent = 0;
  if (planIds.length > 0) {
    const distinctSlots = await prisma.planScheduleSlotSubmission.groupBy({
      by: ["planId", "slotKey"],
      where: { userId, planId: { in: planIds } },
    });
    const doneByPlan = new Map<string, Set<string>>();
    for (const row of distinctSlots) {
      if (!doneByPlan.has(row.planId)) doneByPlan.set(row.planId, new Set());
      doneByPlan.get(row.planId)!.add(row.slotKey);
    }

    let sumRatio = 0;
    let counted = 0;
    for (const p of plans) {
      const version = p.confirmedVersion ?? p.currentVersion ?? 1;
      const schedule = await loadScheduleForPlanVersion(p.id, version);
      const total = schedule?.slots?.length ?? 0;
      if (total <= 0) continue;
      const doneSet = doneByPlan.get(p.id);
      let done = 0;
      if (doneSet && schedule?.slots) {
        for (const slot of schedule.slots) {
          if (doneSet.has(slot.slotKey)) done += 1;
        }
      }
      sumRatio += done / total;
      counted += 1;
    }
    avgProgressPercent =
      counted > 0 ? Math.round((sumRatio / counted) * 100) : 0;
  }

  const trendSince = new Date(mondayStartLocal(now));
  trendSince.setDate(trendSince.getDate() - 7 * 11);
  trendSince.setHours(0, 0, 0, 0);

  const trendRows = await prisma.planScheduleSlotSubmission.findMany({
    where: {
      userId,
      createdAt: { gte: trendSince },
    },
    select: { createdAt: true },
  });
  const weeklyCheckinTrend = buildWeeklyTrendLocal(
    trendRows.map((r) => r.createdAt),
    now,
    12,
  );

  return {
    activePlans,
    weekCheckinsCompleted: weekCount,
    avgProgressPercent,
    weeklyCheckinTrend,
    weekRangeLabel,
  };
}
