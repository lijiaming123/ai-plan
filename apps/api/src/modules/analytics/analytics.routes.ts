import type { FastifyInstance } from 'fastify';
import { computeRegistrationFunnel } from './analytics-funnel.service';
import { computeRetentionCohort } from './analytics-retention.service';
import { computeTopPaths, parsePathStartEvent } from './analytics-path.service';

function parseDayBoundary(iso: string, endOfDay: boolean): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  if (endOfDay) {
    return new Date(`${iso}T23:59:59.999Z`);
  }
  return new Date(`${iso}T00:00:00.000Z`);
}

export async function registerAnalyticsRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/analytics/funnel',
    { preHandler: fastify.requirePermission('analytics:read') },
    async (request, reply) => {
      const q = request.query as {
        start?: string;
        end?: string;
        windowDays?: string;
        source?: string;
        platform?: string;
        clientVersion?: string;
      };
      const start = q.start?.trim();
      const end = q.end?.trim();
      if (!start || !end) {
        return reply.code(400).send({ message: 'start and end are required (YYYY-MM-DD)' });
      }
      const startAt = parseDayBoundary(start, false);
      const endAt = parseDayBoundary(end, true);
      if (!startAt || !endAt || startAt > endAt) {
        return reply.code(400).send({ message: 'invalid start/end' });
      }

      const windowDaysRaw = q.windowDays != null ? parseInt(String(q.windowDays), 10) : 7;
      const windowDays = Number.isFinite(windowDaysRaw) && windowDaysRaw > 0 ? windowDaysRaw : 7;

      const data = await computeRegistrationFunnel({
        start: startAt,
        end: endAt,
        windowDays,
        dim: {
          source: q.source?.trim(),
          platform: q.platform?.trim(),
          clientVersion: q.clientVersion?.trim(),
        },
      });

      return reply.send(data);
    },
  );

  fastify.get(
    '/analytics/retention',
    { preHandler: fastify.requirePermission('analytics:read') },
    async (request, reply) => {
      const q = request.query as {
        cohortStart?: string;
        cohortEnd?: string;
        offsets?: string;
        source?: string;
        platform?: string;
        clientVersion?: string;
      };
      const cs = q.cohortStart?.trim();
      const ce = q.cohortEnd?.trim();
      if (!cs || !ce) {
        return reply.code(400).send({ message: 'cohortStart and cohortEnd are required (YYYY-MM-DD)' });
      }
      const cohortStart = parseDayBoundary(cs, false);
      const cohortEnd = parseDayBoundary(ce, true);
      if (!cohortStart || !cohortEnd || cohortStart > cohortEnd) {
        return reply.code(400).send({ message: 'invalid cohortStart/cohortEnd' });
      }

      const offsetsRaw = q.offsets != null ? String(q.offsets).trim() : '';
      const offsets =
        offsetsRaw !== ''
          ? offsetsRaw
              .split(',')
              .map((s) => parseInt(s.trim(), 10))
              .filter((n) => Number.isFinite(n) && n > 0)
          : [1, 7, 30];
      if (offsets.length === 0) {
        return reply.code(400).send({ message: 'invalid offsets' });
      }

      const data = await computeRetentionCohort({
        cohortStart,
        cohortEnd,
        offsets,
        dim: {
          source: q.source?.trim(),
          platform: q.platform?.trim(),
          clientVersion: q.clientVersion?.trim(),
        },
      });

      return reply.send(data);
    },
  );

  fastify.get(
    '/analytics/path',
    { preHandler: fastify.requirePermission('analytics:read') },
    async (request, reply) => {
      const q = request.query as {
        start?: string;
        end?: string;
        startEvent?: string;
        pathLength?: string;
        top?: string;
        source?: string;
        platform?: string;
        clientVersion?: string;
      };
      const start = q.start?.trim();
      const end = q.end?.trim();
      if (!start || !end) {
        return reply.code(400).send({ message: 'start and end are required (YYYY-MM-DD)' });
      }
      const startAt = parseDayBoundary(start, false);
      const endAt = parseDayBoundary(end, true);
      if (!startAt || !endAt || startAt > endAt) {
        return reply.code(400).send({ message: 'invalid start/end' });
      }

      const startEvent = parsePathStartEvent(q.startEvent);
      if (!startEvent) {
        return reply.code(400).send({ message: 'invalid startEvent' });
      }

      const plRaw = q.pathLength != null ? parseInt(String(q.pathLength), 10) : 4;
      const pathLength = Number.isFinite(plRaw) ? plRaw : 4;

      const topRaw = q.top != null ? parseInt(String(q.top), 10) : 20;
      const top = Number.isFinite(topRaw) ? topRaw : 20;

      const data = await computeTopPaths({
        start: startAt,
        end: endAt,
        startEvent,
        pathLength,
        top,
        dim: {
          source: q.source?.trim(),
          platform: q.platform?.trim(),
          clientVersion: q.clientVersion?.trim(),
        },
      });

      return reply.send(data);
    },
  );
}
