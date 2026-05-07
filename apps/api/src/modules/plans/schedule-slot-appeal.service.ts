/**
 * 打卡核验未通过后，用户针对某时间槽发起申诉（status=open 表示申诉中）。
 * 创建后先做 AI 预审：通过则自动写入成功提交并关闭申诉；否则保持 open 进入人工。
 */
import { prisma } from "../../lib/prisma";
import { runAppealAiScreening } from "./appeal-ai-screening.service";
import type { CheckinPublicReview } from "./checkin-submission-score.service";
import type { CheckinSchedule } from "./deepseek-schedule";
import type {
  ScheduleSlotCheckinAttachmentInput,
  SerializedScheduleSlotSubmission,
} from "./schedule-slot-checkin.service";
import { persistApprovedCheckinSubmission } from "./schedule-slot-checkin.service";

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
  /** 与弹窗中「完成证明」一致，供 AI 通过后自动建档 */
  proofContent?: string;
  proofAttachments?: ScheduleSlotCheckinAttachmentInput[];
  lastReview?: CheckinPublicReview | null;
}): Promise<
  | { ok: false; code: 400 | 403 | 404 | 409; message: string }
  | {
      ok: true;
      appeal: { id: string; content: string; createdAt: string };
      outcome: "ai_approved" | "human_review";
      aiRationale: string;
      submission?: SerializedScheduleSlotSubmission;
    }
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

  const slotRow = schedule.slots.find((s) => s.slotKey === params.slotKey);
  const slotContent = (slotRow?.content ?? "").trim();

  const proofText = (params.proofContent ?? "").trim();
  const proofAtt = Array.isArray(params.proofAttachments) ? params.proofAttachments : [];
  const proofUrls = proofAtt
    .map((a) => (typeof a?.url === "string" ? a.url.trim() : ""))
    .filter((u) => u.length > 0);

  const screening = await runAppealAiScreening({
    planGoal: plan.goal ?? "",
    slotContent,
    appealText: text,
    proofText,
    proofAttachmentCount: proofUrls.length,
    lastReview: params.lastReview ?? undefined,
  });

  await prisma.planScheduleSlotAppeal.update({
    where: { id: created.id },
    data: {
      aiVerdict: screening.decision,
      aiRationale: screening.rationale.slice(0, 2000),
    },
  });

  const appealOut = {
    id: created.id,
    content: created.content,
    createdAt: created.createdAt.toISOString(),
  };

  if (screening.decision === "approve") {
    const persistContent = proofText || text;
    const persisted = await persistApprovedCheckinSubmission({
      planId: params.planId,
      userId: params.userId,
      slotKey: params.slotKey,
      content: persistContent,
      attachments: proofAtt.length ? proofAtt : undefined,
    });
    if (persisted.ok) {
      await prisma.planScheduleSlotAppeal.update({
        where: { id: created.id },
        data: { status: "closed" },
      });
      return {
        ok: true,
        appeal: appealOut,
        outcome: "ai_approved",
        aiRationale: screening.rationale,
        submission: persisted.submission,
      };
    }
    const escRationale = `${screening.rationale}（采纳时建档失败：${persisted.message}，已转人工）`.slice(
      0,
      2000,
    );
    await prisma.planScheduleSlotAppeal.update({
      where: { id: created.id },
      data: { aiVerdict: "escalate", aiRationale: escRationale },
    });
    return {
      ok: true,
      appeal: appealOut,
      outcome: "human_review",
      aiRationale: escRationale,
    };
  }

  return {
    ok: true,
    appeal: appealOut,
    outcome: "human_review",
    aiRationale: screening.rationale,
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
