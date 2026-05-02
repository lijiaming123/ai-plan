import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export async function listAdminUsers(input: { search?: string; page: number; pageSize: number }) {
  const page = Math.max(1, Math.floor(input.page));
  const pageSize = Math.min(100, Math.max(1, Math.floor(input.pageSize)));
  const skip = (page - 1) * pageSize;
  const search = (input.search ?? '').trim();
  const pattern = search === '' ? '%' : `%${search}%`;

  const rows = await prisma.$queryRaw<{ uid: string }[]>(Prisma.sql`
    SELECT DISTINCT uid FROM (
      SELECT "userId" AS uid FROM "Plan"
      UNION
      SELECT "userId" FROM "TaskSubmission"
      UNION
      SELECT "userId" FROM "TelemetryRawEvent" WHERE "userId" IS NOT NULL
    ) AS t
    WHERE uid IS NOT NULL AND uid::text ILIKE ${pattern}
    ORDER BY uid ASC
    LIMIT ${pageSize} OFFSET ${skip}
  `);

  const countRows = await prisma.$queryRaw<[{ n: bigint }]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT DISTINCT uid FROM (
        SELECT "userId" AS uid FROM "Plan"
        UNION
        SELECT "userId" FROM "TaskSubmission"
        UNION
        SELECT "userId" FROM "TelemetryRawEvent" WHERE "userId" IS NOT NULL
      ) AS t
      WHERE uid IS NOT NULL AND uid::text ILIKE ${pattern}
    ) AS c
  `);

  const total = Number(countRows[0]?.n ?? 0n);

  return {
    items: rows.map((r) => ({ userId: r.uid })),
    total,
    page,
    pageSize,
  };
}

function minDate(dates: (Date | null | undefined)[]): Date | null {
  const ok = dates.filter((d): d is Date => d instanceof Date);
  if (ok.length === 0) return null;
  return new Date(Math.min(...ok.map((d) => d.getTime())));
}

function maxDate(dates: (Date | null | undefined)[]): Date | null {
  const ok = dates.filter((d): d is Date => d instanceof Date);
  if (ok.length === 0) return null;
  return new Date(Math.max(...ok.map((d) => d.getTime())));
}

export async function getAdminUserDetail(userId: string) {
  const [planCount, taskSubmissionCount, checkinCount, telemetryCount] = await Promise.all([
    prisma.plan.count({ where: { userId } }),
    prisma.taskSubmission.count({ where: { userId } }),
    prisma.planScheduleSlotSubmission.count({ where: { userId } }),
    prisma.telemetryRawEvent.count({ where: { userId } }),
  ]);

  if (planCount + taskSubmissionCount + telemetryCount === 0) {
    return null;
  }

  const [
    firstPlan,
    firstSub,
    firstTel,
    lastPlan,
    lastSub,
    lastTel,
    lastCheckin,
    regEvent,
    telemetryTop,
  ] = await Promise.all([
    prisma.plan.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    prisma.taskSubmission.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    prisma.telemetryRawEvent.findFirst({
      where: { userId },
      orderBy: { eventTime: 'asc' },
      select: { eventTime: true },
    }),
    prisma.plan.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.taskSubmission.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.telemetryRawEvent.findFirst({
      where: { userId },
      orderBy: { eventTime: 'desc' },
      select: { eventTime: true },
    }),
    prisma.planScheduleSlotSubmission.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.telemetryRawEvent.findFirst({
      where: { userId, eventName: 'auth_register' },
      orderBy: { eventTime: 'asc' },
      select: { eventTime: true },
    }),
    prisma.telemetryRawEvent.groupBy({
      by: ['eventName'],
      where: { userId },
      // Prisma groupBy 的 _count 排序不支持 `_all`，用分组字段本身计数即可
      _count: { eventName: true },
      orderBy: { _count: { eventName: 'desc' } },
      take: 10,
    }),
  ]);

  const firstActivityAt = minDate([firstPlan?.createdAt, firstSub?.createdAt, firstTel?.eventTime]);
  const lastActivityAt = maxDate([
    lastPlan?.createdAt,
    lastSub?.createdAt,
    lastTel?.eventTime,
    lastCheckin?.createdAt,
  ]);

  return {
    userId,
    planCount,
    checkinSubmissionCount: checkinCount,
    taskSubmissionCount,
    telemetryEventCount: telemetryCount,
    registeredAtApprox: regEvent?.eventTime.toISOString() ?? null,
    firstActivityAt: firstActivityAt?.toISOString() ?? null,
    lastActivityAt: lastActivityAt?.toISOString() ?? null,
    telemetryTopEvents: telemetryTop.map((r) => ({
      eventName: r.eventName,
      count: r._count.eventName,
    })),
  };
}
