import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

function isPrismaUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export type InAppNotificationRow = {
  id: string;
  userId: string;
  type: string;
  planId: string;
  slotKey: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

function rowToOut(r: {
  id: string;
  userId: string;
  type: string;
  planId: string;
  slotKey: string;
  title: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
}): InAppNotificationRow {
  return {
    id: r.id,
    userId: r.userId,
    type: r.type,
    planId: r.planId,
    slotKey: r.slotKey,
    title: r.title,
    body: r.body,
    readAt: r.readAt ? r.readAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listNotificationsForUser(
  userId: string,
  options?: { limit?: number; cursor?: string },
) {
  const take = Math.min(100, Math.max(1, options?.limit ?? 30));
  const cursor = options?.cursor;
  const items = await prisma.inAppNotification.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor
      ? { skip: 1, cursor: { id: cursor } as { id: string } }
      : {}),
  });
  const hasMore = items.length > take;
  const page = hasMore ? items.slice(0, take) : items;
  return {
    items: page.map(rowToOut),
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  };
}

export async function countUnreadForUser(userId: string) {
  return prisma.inAppNotification.count({
    where: { userId, readAt: null },
  });
}

export async function markNotificationRead(userId: string, id: string) {
  const n = await prisma.inAppNotification.findFirst({
    where: { id, userId },
  });
  if (!n) return { ok: false as const, code: 404 as const, message: "not found" };
  await prisma.inAppNotification.update({
    where: { id },
    data: { readAt: new Date() },
  });
  return { ok: true as const };
}

export async function markAllReadForUser(userId: string) {
  await prisma.inAppNotification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function tryCreateCheckinNotification(input: {
  userId: string;
  type: "checkin_due_day" | "checkin_due_week";
  planId: string;
  slotKey: string;
  goal: string;
  dedupeKey: string;
}): Promise<{ created: boolean }> {
  const title =
    input.type === "checkin_due_day"
      ? `「${input.goal.slice(0, 40)}${input.goal.length > 40 ? "…" : ""}」· 待打卡`
      : `「${input.goal.slice(0, 40)}${input.goal.length > 40 ? "…" : ""}」· 周打卡待补`;
  const body =
    input.type === "checkin_due_day"
      ? `时间槽 ${input.slotKey} 今日尚未提交证明，逾期仍可补记。点按前往计划。`
      : `时间槽 ${input.slotKey} 本周尚未提交证明。点按前往计划。`;

  const payload: Prisma.InputJsonValue = {
    link: `/plans/${input.planId}?slotKey=${encodeURIComponent(input.slotKey)}&openCheckin=1`,
  };

  try {
    await prisma.inAppNotification.create({
      data: {
        userId: input.userId,
        type: input.type,
        planId: input.planId,
        slotKey: input.slotKey,
        title,
        body,
        dedupeKey: input.dedupeKey,
        payload,
      },
    });
    return { created: true };
  } catch (e) {
    if (isPrismaUniqueViolation(e)) {
      return { created: false };
    }
    throw e;
  }
}
