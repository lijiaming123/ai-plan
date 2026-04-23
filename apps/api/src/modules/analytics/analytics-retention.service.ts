import { prisma } from '../../lib/prisma';
import { buildDimWhere, type FunnelDimensionFilter } from './analytics-funnel.service';

function toUtcYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addUtcDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toUtcYmd(d);
}

/**
 * 以用户首次 `auth_register` 的 UTC 日历日为 cohort day；
 * 留存：在 cohortDay+N 的 UTC 日历日是否出现 `dashboard_view` 或 `checkin_submit`。
 */
export async function computeRetentionCohort(input: {
  cohortStart: Date;
  cohortEnd: Date;
  offsets: number[];
  dim?: FunnelDimensionFilter;
}) {
  const dimWhere = buildDimWhere(input.dim ?? {});
  const startYmd = toUtcYmd(input.cohortStart);
  const endYmd = toUtcYmd(input.cohortEnd);

  const registers = await prisma.telemetryRawEvent.findMany({
    where: {
      eventName: 'auth_register',
      userId: { not: null },
      ...dimWhere,
    },
    select: { userId: true, eventTime: true },
    orderBy: { eventTime: 'asc' },
  });

  const userCohortYmd = new Map<string, string>();
  for (const r of registers) {
    if (!r.userId || userCohortYmd.has(r.userId)) continue;
    userCohortYmd.set(r.userId, toUtcYmd(r.eventTime));
  }

  const actives = await prisma.telemetryRawEvent.findMany({
    where: {
      eventName: { in: ['dashboard_view', 'checkin_submit'] },
      userId: { not: null },
      ...dimWhere,
    },
    select: { userId: true, eventTime: true },
  });

  const activeYmdByUser = new Map<string, Set<string>>();
  for (const a of actives) {
    if (!a.userId) continue;
    const ymd = toUtcYmd(a.eventTime);
    if (!activeYmdByUser.has(a.userId)) activeYmdByUser.set(a.userId, new Set());
    activeYmdByUser.get(a.userId)!.add(ymd);
  }

  const cohortUsers = new Map<string, Set<string>>();
  for (const [uid, ymd] of userCohortYmd) {
    if (ymd < startYmd || ymd > endYmd) continue;
    if (!cohortUsers.has(ymd)) cohortUsers.set(ymd, new Set());
    cohortUsers.get(ymd)!.add(uid);
  }

  const sortedCohortDays = [...cohortUsers.keys()].sort();

  const rows = sortedCohortDays.map((cohortDay) => {
    const users = cohortUsers.get(cohortDay)!;
    const cohortSize = users.size;
    const retained: Record<string, { count: number; rate: number }> = {};
    for (const n of input.offsets) {
      const targetYmd = addUtcDaysYmd(cohortDay, n);
      let c = 0;
      for (const uid of users) {
        if (activeYmdByUser.get(uid)?.has(targetYmd)) c += 1;
      }
      retained[String(n)] = {
        count: c,
        rate: cohortSize === 0 ? 0 : c / cohortSize,
      };
    }
    return { cohortDay, cohortSize, retained };
  });

  return {
    cohortStart: input.cohortStart.toISOString(),
    cohortEnd: input.cohortEnd.toISOString(),
    offsets: input.offsets,
    rows,
  };
}
