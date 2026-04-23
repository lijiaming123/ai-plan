import { prisma } from '../../lib/prisma';
import type { TelemetryEventName } from '../telemetry/telemetry-event-dictionary';
import { buildDimWhere, type FunnelDimensionFilter } from './analytics-funnel.service';

const SESSION_GAP_MS = 30 * 60 * 1000;

const KNOWN_EVENTS: TelemetryEventName[] = [
  'auth_register',
  'auth_login',
  'plan_create',
  'plan_publish',
  'dashboard_view',
  'checkin_submit',
];

function isTelemetryEventName(s: string): s is TelemetryEventName {
  return (KNOWN_EVENTS as string[]).includes(s);
}

type RawEv = {
  eventTime: Date;
  eventName: string;
  sessionId: string | null;
  userId: string | null;
  anonymousKey: string | null;
};

function groupBySessionId(events: RawEv[]): RawEv[][] {
  const m = new Map<string, RawEv[]>();
  for (const e of events) {
    const sid = e.sessionId;
    if (!sid) continue;
    if (!m.has(sid)) m.set(sid, []);
    m.get(sid)!.push(e);
  }
  return [...m.values()].map((arr) => arr.sort((a, b) => a.eventTime.getTime() - b.eventTime.getTime()));
}

function splitByGap(sorted: RawEv[]): RawEv[][] {
  const out: RawEv[][] = [];
  let cur: RawEv[] = [];
  for (const ev of sorted) {
    if (cur.length === 0) {
      cur.push(ev);
      continue;
    }
    const prev = cur[cur.length - 1]!;
    if (ev.eventTime.getTime() - prev.eventTime.getTime() <= SESSION_GAP_MS) {
      cur.push(ev);
    } else {
      out.push(cur);
      cur = [ev];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

function groupOrphansByWindow(events: RawEv[]): RawEv[][] {
  const byKey = new Map<string, RawEv[]>();
  for (const e of events) {
    if (e.sessionId) continue;
    const key = e.userId ?? e.anonymousKey;
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(e);
  }
  const streams: RawEv[][] = [];
  for (const arr of byKey.values()) {
    const sorted = arr.sort((a, b) => a.eventTime.getTime() - b.eventTime.getTime());
    streams.push(...splitByGap(sorted));
  }
  return streams;
}

function extractPaths(streams: RawEv[][], startEvent: TelemetryEventName, pathLength: number): string[] {
  const keys: string[] = [];
  for (const stream of streams) {
    const idx = stream.findIndex((e) => e.eventName === startEvent);
    if (idx < 0) continue;
    if (idx + pathLength > stream.length) continue;
    const slice = stream.slice(idx, idx + pathLength);
    keys.push(slice.map((e) => e.eventName).join('->'));
  }
  return keys;
}

export async function computeTopPaths(input: {
  start: Date;
  end: Date;
  startEvent: TelemetryEventName;
  pathLength: number;
  top: number;
  dim?: FunnelDimensionFilter;
}) {
  const pathLength = Math.min(6, Math.max(3, Math.floor(input.pathLength)));
  const top = Math.min(100, Math.max(1, Math.floor(input.top)));

  const dimWhere = buildDimWhere(input.dim ?? {});

  const rows = await prisma.telemetryRawEvent.findMany({
    where: {
      eventTime: { gte: input.start, lte: input.end },
      ...dimWhere,
    },
    select: {
      eventTime: true,
      eventName: true,
      sessionId: true,
      userId: true,
      anonymousKey: true,
    },
    orderBy: { eventTime: 'asc' },
  });

  const withSid = rows.filter((r) => r.sessionId != null && r.sessionId !== '');
  const withoutSid = rows.filter((r) => r.sessionId == null || r.sessionId === '');

  const streams: RawEv[][] = [...groupBySessionId(withSid as RawEv[]), ...groupOrphansByWindow(withoutSid as RawEv[])];

  const pathKeys = extractPaths(streams, input.startEvent, pathLength);
  const totalPaths = pathKeys.length;

  const counts = new Map<string, number>();
  for (const k of pathKeys) {
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const take = sorted.slice(0, top);

  return {
    start: input.start.toISOString(),
    end: input.end.toISOString(),
    startEvent: input.startEvent,
    pathLength,
    sessionGapMinutes: SESSION_GAP_MS / 60_000,
    streamCount: streams.length,
    totalPaths,
    paths: take.map(([path, count]) => ({
      path,
      count,
      share: totalPaths === 0 ? 0 : count / totalPaths,
    })),
  };
}

export function parsePathStartEvent(raw: string | undefined): TelemetryEventName | null {
  const s = raw?.trim() ?? '';
  if (!s) return 'dashboard_view';
  return isTelemetryEventName(s) ? s : null;
}
