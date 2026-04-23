import { prisma } from '../../lib/prisma';

export function buildTelemetryDimensionKey(
  source: string | null | undefined,
  platform: string,
  clientVersion: string | null | undefined,
) {
  return `${source ?? ''}|${platform}|${clientVersion ?? ''}`;
}

function parseUtcDayStart(dayIso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayIso)) return null;
  const d = new Date(`${dayIso}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * 按 UTC 自然日聚合 TelemetryRawEvent → TelemetryDailyAgg。
 * 同一 day 重复执行会先删除该日已有聚合行再写入（幂等）。
 */
export async function aggregateTelemetryForUtcDay(dayIso: string): Promise<{ rows: number }> {
  const dayStart = parseUtcDayStart(dayIso);
  if (!dayStart) {
    throw new Error('invalid dayIso');
  }
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCHours(23, 59, 59, 999);

  await prisma.telemetryDailyAgg.deleteMany({
    where: { day: dayStart },
  });

  const groups = await prisma.telemetryRawEvent.groupBy({
    by: ['eventName', 'source', 'platform', 'clientVersion'],
    where: {
      eventTime: { gte: dayStart, lte: dayEnd },
    },
    _count: { _all: true },
  });

  if (groups.length === 0) {
    return { rows: 0 };
  }

  const userRows = await prisma.$queryRaw<
    Array<{
      eventName: string;
      source: string | null;
      platform: string;
      clientVersion: string | null;
      c: bigint;
    }>
  >`
    SELECT "eventName", "source", "platform", "clientVersion",
      COUNT(DISTINCT "userId")::int AS c
    FROM "TelemetryRawEvent"
    WHERE "eventTime" >= ${dayStart}
      AND "eventTime" <= ${dayEnd}
      AND "userId" IS NOT NULL
    GROUP BY "eventName", "source", "platform", "clientVersion"
  `;

  const userMap = new Map<string, number>();
  for (const row of userRows) {
    const key = `${row.eventName}\0${row.source ?? ''}\0${row.platform}\0${row.clientVersion ?? ''}`;
    userMap.set(key, Number(row.c));
  }

  await prisma.telemetryDailyAgg.createMany({
    data: groups.map((g) => {
      const ukey = `${g.eventName}\0${g.source ?? ''}\0${g.platform}\0${g.clientVersion ?? ''}`;
      return {
        day: dayStart,
        eventName: g.eventName,
        dimensionKey: buildTelemetryDimensionKey(g.source, g.platform, g.clientVersion),
        eventCount: g._count._all,
        userCount: userMap.get(ukey) ?? 0,
      };
    }),
  });

  return { rows: groups.length };
}
