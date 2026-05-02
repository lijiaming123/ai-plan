/**
 * 打卡核验未通过后，用户针对某时间槽发起申诉（status=open 表示申诉中）。
 */
import { prisma } from "../../lib/prisma";
import type { CheckinSchedule } from "./deepseek-schedule";

export type OpenAppealBySlot = Record<
  string,
  { id: string; content: string; createdAt: string }
>;

async function loadConfirmedPlanSchedule(
  planId: string,
): Promise<CheckinSchedule | null> {
  const plan = await prisma.plan.findFirst({ where: { id: planId } });
  if (!plan) return null;
  const version = plan.confirmedVersion ?? plan.currentVersion ?? 1;
  const scheduleRows = (await prisma.$queryRawUnsafe(
    'SELECT schedule FROM "PlanVersion" WHERE "planId" = $1 AND version = $2 LIMIT 1',
    planId,
    version,
  )) as Array<{ schedule: unknown | null }>;
  const schedule = scheduleRows[0]?.schedule as CheckinSchedule | null | undefined;
  if (!schedule || !Array.isArray(schedule.slots)) return null;
  return schedule;
}

export async function listOpenScheduleSlotAppeals(
  planId: string,
  userId: string,
): Promise<OpenAppealBySlot> {
  const rows = await prisma.planScheduleSlotAppeal.findMany({
    where: { planId, userId, status: "open" },
    orderBy: { createdAt: "desc" },
  });
  const out: OpenAppealBySlot = {};
  for (const r of rows) {
    if (out[r.slotKey]) continue;
    out[r.slotKey] = {
      id: r.id,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
    };
  }
  return out;
}

export async function createScheduleSlotAppeal(params: {
  planId: string;
  userId: string;
  slotKey: string;
  content: string;
}): Promise<
  | { ok: false; code: 400 | 403 | 404 | 409; message: string }
  | { ok: true; appeal: { id: string; content: string; createdAt: string } }
> {
  const plan = await prisma.plan.findFirst({
    where: { id: params.planId, userId: params.userId },
  });
  if (!plan) return { ok: false, code: 404, message: "plan not found" };
  if (plan.archivedAt) {
    return { ok: false, code: 403, message: "已归档的计划不可发起申诉" };
  }

  const text = params.content.trim();
  if (text.length < 4) {
    return { ok: false, code: 400, message: "appeal content is too short" };
  }
  if (text.length > 5000) {
    return { ok: false, code: 400, message: "appeal content is too long" };
  }

  const schedule = await loadConfirmedPlanSchedule(params.planId);
  if (!schedule) return { ok: false, code: 404, message: "schedule not found" };
  const slotOk = schedule.slots.some((s) => s.slotKey === params.slotKey);
  if (!slotOk) return { ok: false, code: 404, message: "slot not found" };

  const existing = await prisma.planScheduleSlotAppeal.findFirst({
    where: {
      planId: params.planId,
      userId: params.userId,
      slotKey: params.slotKey,
      status: "open",
    },
  });
  if (existing) {
    return { ok: false, code: 409, message: "该时间槽已有进行中的申诉" };
  }

  const created = await prisma.planScheduleSlotAppeal.create({
    data: {
      planId: params.planId,
      userId: params.userId,
      slotKey: params.slotKey,
      content: text,
      status: "open",
    },
  });

  return {
    ok: true,
    appeal: {
      id: created.id,
      content: created.content,
      createdAt: created.createdAt.toISOString(),
    },
  };
}

export async function withdrawScheduleSlotAppeal(params: {
  planId: string;
  userId: string;
  slotKey: string;
}): Promise<
  | { ok: false; code: 400 | 404; message: string }
  | { ok: true }
> {
  const plan = await prisma.plan.findFirst({
    where: { id: params.planId, userId: params.userId },
  });
  if (!plan) return { ok: false, code: 404, message: "plan not found" };

  const res = await prisma.planScheduleSlotAppeal.updateMany({
    where: {
      planId: params.planId,
      userId: params.userId,
      slotKey: params.slotKey,
      status: "open",
    },
    data: { status: "closed" },
  });

  if (res.count === 0) {
    return { ok: false, code: 404, message: "no open appeal for this slot" };
  }
  return { ok: true };
}
