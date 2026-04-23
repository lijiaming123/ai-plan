import { prisma } from '../../lib/prisma';
import type { TelemetryEventName } from '../telemetry/telemetry-event-dictionary';

/** 预置漏斗：注册 → 创建计划 → 发布 → 首次打卡类事件 */
export const DEFAULT_FUNNEL_STEPS: TelemetryEventName[] = [
  'auth_register',
  'plan_create',
  'plan_publish',
  'checkin_submit',
];

export type FunnelDimensionFilter = {
  source?: string;
  platform?: string;
  clientVersion?: string;
};

export function buildDimWhere(dim: FunnelDimensionFilter): Record<string, string> {
  const w: Record<string, string> = {};
  if (dim.source != null && dim.source !== '') w.source = dim.source;
  if (dim.platform != null && dim.platform !== '') w.platform = dim.platform;
  if (dim.clientVersion != null && dim.clientVersion !== '') w.clientVersion = dim.clientVersion;
  return w;
}

/**
 * 基于 TelemetryRawEvent、仅统计 **userId 非空** 的用户在漏斗各步的转化。
 * - 第 1 步：在 [start,end] 内首次发生该事件的用户
 * - 后续步：相对第 1 步起点时间在 windowDays 内首次发生该事件
 */
export async function computeRegistrationFunnel(input: {
  start: Date;
  end: Date;
  windowDays: number;
  steps?: TelemetryEventName[];
  dim?: FunnelDimensionFilter;
}) {
  const steps = input.steps?.length ? input.steps : DEFAULT_FUNNEL_STEPS;
  const dimWhere = buildDimWhere(input.dim ?? {});
  const windowMs = Math.max(1, input.windowDays) * 86_400_000;
  const rangeEnd = new Date(input.end.getTime() + windowMs);

  const step0 = steps[0];
  const rows0 = await prisma.telemetryRawEvent.findMany({
    where: {
      eventName: step0,
      eventTime: { gte: input.start, lte: input.end },
      userId: { not: null },
      ...dimWhere,
    },
    select: { userId: true, eventTime: true },
    orderBy: { eventTime: 'asc' },
  });

  let prev = new Map<string, Date>();
  for (const r of rows0) {
    if (r.userId && !prev.has(r.userId)) {
      prev.set(r.userId, r.eventTime);
    }
  }

  const out: Array<{
    step: string;
    count: number;
    conversionFromPrev: number | null;
  }> = [{ step: step0, count: prev.size, conversionFromPrev: null }];

  for (let i = 1; i < steps.length; i++) {
    const name = steps[i];
    const uids = [...prev.keys()];
    if (uids.length === 0) {
      out.push({ step: name, count: 0, conversionFromPrev: 0 });
      prev = new Map();
      continue;
    }

    const evs = await prisma.telemetryRawEvent.findMany({
      where: {
        eventName: name,
        userId: { in: uids },
        eventTime: { gte: input.start, lte: rangeEnd },
        ...dimWhere,
      },
      select: { userId: true, eventTime: true },
      orderBy: { eventTime: 'asc' },
    });

    const first = new Map<string, Date>();
    for (const e of evs) {
      if (!e.userId) continue;
      if (!first.has(e.userId)) first.set(e.userId, e.eventTime);
    }

    const next = new Map<string, Date>();
    const prevSize = prev.size;
    for (const [uid, t0] of prev) {
      const t1 = first.get(uid);
      if (
        t1 &&
        t1.getTime() >= t0.getTime() &&
        t1.getTime() - t0.getTime() <= windowMs
      ) {
        next.set(uid, t1);
      }
    }

    const conversionFromPrev = prevSize === 0 ? 0 : next.size / prevSize;
    out.push({ step: name, count: next.size, conversionFromPrev });
    prev = next;
  }

  return {
    template: 'registration_to_checkin',
    windowDays: input.windowDays,
    start: input.start.toISOString(),
    end: input.end.toISOString(),
    steps: out,
  };
}
