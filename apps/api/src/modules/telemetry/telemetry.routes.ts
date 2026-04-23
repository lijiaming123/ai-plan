import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma';
import {
  validateAndSanitizeTelemetryEvent,
  type TelemetryEvent,
  type TelemetryPlatform,
} from './telemetry-event-dictionary';

type IngestAuth =
  | { kind: 'user'; userId: string }
  | { kind: 'anonymous'; keyId: string };

function getBearer(request: FastifyRequest) {
  const auth = request.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice('Bearer '.length).trim() || null;
}

async function resolveIngestAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<IngestAuth | null> {
  const bearer = getBearer(request);
  if (bearer) {
    try {
      const payload = await request.jwtVerify<{ sub: string; role: 'user' | 'admin' }>();
      // 允许 user/admin token 上报；用户 id 统一用 sub
      return { kind: 'user', userId: payload.sub };
    } catch {
      return reply.code(401).send({ message: 'Invalid token' }) as any;
    }
  }

  const expected = process.env.TELEMETRY_INGEST_KEY ?? 'dev-telemetry-key';
  const provided = String(request.headers['x-telemetry-key'] ?? '').trim();
  if (!provided || provided !== expected) {
    reply.code(401).send({ message: 'Unauthorized' });
    return null;
  }
  return { kind: 'anonymous', keyId: 'default' };
}

// 简单内存限流：每个 ip 每分钟最多 N 次请求（v1 足够；后续可换插件或 Redis）
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_IP = 120;
const rateMap = new Map<string, { windowStart: number; count: number }>();

function hitRateLimit(ip: string) {
  const now = Date.now();
  const cur = rateMap.get(ip);
  if (!cur || now - cur.windowStart >= RATE_WINDOW_MS) {
    rateMap.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  cur.count += 1;
  return cur.count > RATE_MAX_PER_IP;
}

function parsePlatform(raw: string | undefined): TelemetryPlatform {
  const p = (raw ?? '').trim().toLowerCase();
  if (p === 'web' || p === 'ios' || p === 'android') return p;
  return 'unknown';
}

function readClientDimensions(request: FastifyRequest) {
  const source =
    typeof request.headers['x-telemetry-source'] === 'string'
      ? request.headers['x-telemetry-source'].trim() || null
      : null;
  const clientVersion =
    typeof request.headers['x-client-version'] === 'string'
      ? request.headers['x-client-version'].trim() || null
      : null;
  const platform = parsePlatform(
    typeof request.headers['x-platform'] === 'string' ? request.headers['x-platform'] : undefined,
  );
  return { source, clientVersion, platform };
}

export async function registerTelemetryRoutes(fastify: FastifyInstance) {
  fastify.post('/telemetry/events', async (request, reply) => {
    const ip = request.ip || 'unknown';
    if (hitRateLimit(ip)) {
      return reply.code(429).send({ message: 'Too Many Requests' });
    }

    const auth = await resolveIngestAuth(request, reply);
    if (!auth) return;

    const body = request.body as { events?: unknown } | undefined;
    const rawEvents = (body?.events ?? []) as unknown;
    if (!Array.isArray(rawEvents)) {
      return reply.code(400).send({ message: 'events must be array' });
    }

    let accepted = 0;
    let dropped = 0;
    const reasonCounts: Record<string, number> = {};

    const sanitizedEvents: TelemetryEvent[] = [];
    for (const raw of rawEvents) {
      const v = validateAndSanitizeTelemetryEvent(raw);
      if (!v.ok) {
        dropped += 1;
        reasonCounts[v.code] = (reasonCounts[v.code] ?? 0) + 1;
        continue;
      }
      if (v.droppedForbiddenKeys.length) {
        reasonCounts.forbidden_keys_dropped =
          (reasonCounts.forbidden_keys_dropped ?? 0) + v.droppedForbiddenKeys.length;
      }
      accepted += 1;
      sanitizedEvents.push(v.sanitized);
    }

    const dims = readClientDimensions(request);
    const userId = auth.kind === 'user' ? auth.userId : null;
    const anonymousKey = auth.kind === 'anonymous' ? auth.keyId : null;

    if (sanitizedEvents.length > 0) {
      await prisma.telemetryRawEvent.createMany({
        data: sanitizedEvents.map((e) => ({
          eventTime: new Date(e.time),
          eventName: e.name,
          userId,
          anonymousKey,
          sessionId: e.sessionId ?? null,
          page: e.page ?? null,
          source: dims.source,
          platform: dims.platform,
          clientVersion: dims.clientVersion,
          properties: (e.properties ?? undefined) as object | undefined,
        })),
      });
    }

    return reply.send({
      accepted,
      dropped,
      reasonCounts,
    });
  });
}

