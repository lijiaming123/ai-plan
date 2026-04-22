import type { FastifyInstance } from "fastify";
import { countUnreadForUser, listNotificationsForUser, markAllReadForUser, markNotificationRead } from "./in-app-notification.service";
import {
  getOrCreateNotificationSettings,
  minutesToHhmm,
  updateNotificationSettings,
} from "./user-notification-settings.service";

function isRecordLoose(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function normalizeBody(raw: unknown) {
  if (isRecordLoose(raw)) return raw;
  return {};
}

export async function registerNotificationRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/notifications",
    { preHandler: fastify.requireRole("user") },
    async (request) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      const q = request.query as { cursor?: string; limit?: string };
      const limit = q.limit != null ? parseInt(String(q.limit), 10) : 30;
      return listNotificationsForUser(payload.sub, {
        cursor: q.cursor,
        limit: Number.isFinite(limit) ? limit : 30,
      });
    },
  );

  fastify.get(
    "/notifications/unread-count",
    { preHandler: fastify.requireRole("user") },
    async (request) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      const n = await countUnreadForUser(payload.sub);
      return { unreadCount: n };
    },
  );

  fastify.patch(
    "/notifications/:id/read",
    { preHandler: fastify.requireRole("user") },
    async (request, reply) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      const { id } = request.params as { id: string };
      const r = await markNotificationRead(payload.sub, id);
      if (!r.ok) return reply.code(404).send({ message: r.message });
      return { ok: true };
    },
  );

  fastify.post(
    "/notifications/read-all",
    { preHandler: fastify.requireRole("user") },
    async (request) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      await markAllReadForUser(payload.sub);
      return { ok: true };
    },
  );

  fastify.get(
    "/me/notification-preferences",
    { preHandler: fastify.requireRole("user") },
    async (request) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      const s = await getOrCreateNotificationSettings(payload.sub);
      return {
        timeZone: s.timeZone,
        remindAt: minutesToHhmm(s.remindAtMinutes),
        pendingRemindAt:
          s.pendingRemindAtMinutes != null
            ? minutesToHhmm(s.pendingRemindAtMinutes)
            : null,
        switchAt: s.switchAt ? s.switchAt.toISOString() : null,
      };
    },
  );

  fastify.patch(
    "/me/notification-preferences",
    { preHandler: fastify.requireRole("user") },
    async (request, reply) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      const body = normalizeBody(request.body);
      const r = isRecordLoose(body) ? body : {};
      const timeZone = typeof r.timeZone === "string" ? r.timeZone : undefined;
      const remindAt = typeof r.remindAt === "string" ? r.remindAt : undefined;
      if (timeZone == null && remindAt == null) {
        return reply
          .code(400)
          .send({ message: "set remindAt and/or timeZone" });
      }
      const res = await updateNotificationSettings({
        userId: payload.sub,
        timeZone,
        reminderTime: remindAt,
      });
      if ("ok" in res && res.ok === false) {
        return reply.code(400).send({ message: res.message });
      }
      const s = await getOrCreateNotificationSettings(payload.sub);
      return {
        timeZone: s.timeZone,
        remindAt: minutesToHhmm(s.remindAtMinutes),
        pendingRemindAt:
          s.pendingRemindAtMinutes != null
            ? minutesToHhmm(s.pendingRemindAtMinutes)
            : null,
        switchAt: s.switchAt ? s.switchAt.toISOString() : null,
      };
    },
  );
}
