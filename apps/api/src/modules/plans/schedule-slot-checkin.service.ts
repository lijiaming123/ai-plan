/**
 * 计划打卡时间槽上的「完成证明」提交（与 TaskSubmission 独立）。
 * 附件仅存可访问 URL（与现有任务提交一致）；kind 由文件名/扩展名推断。
 */
import { prisma } from '../../lib/prisma';
import { hashUrl } from '../storage/storage.service';
import type { CheckinSchedule, CheckinSlot } from './deepseek-schedule';
import {
  evaluateCheckinSubmission,
  type CheckinPublicReview,
} from './checkin-submission-score.service';
import { extractTextFromAttachmentUrl } from '../uploads/attachment-extract.service';

export type ScheduleSlotCheckinAttachmentInput = {
  url: string;
  fileName?: string;
  kind?: string;
};

export type SerializedScheduleSlotAttachment = {
  id: string;
  url: string;
  fileName: string | null;
  kind: string;
  hash: string;
  createdAt: string;
};

export type SerializedScheduleSlotSubmission = {
  id: string;
  content: string;
  status: string;
  createdAt: string;
  attachments: SerializedScheduleSlotAttachment[];
};

function inferAttachmentKind(fileName: string | undefined, url: string): 'image' | 'document' | 'other' {
  const raw = (fileName ?? url).toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/.test(raw)) return 'image';
  if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|csv)(\?|$)/.test(raw)) return 'document';
  return 'other';
}

async function loadPlanScheduleForUser(
  planId: string,
  userId: string
): Promise<
  | { ok: false; code: 404; message: string }
  | { ok: false; code: 403; message: string }
  | { ok: true; schedule: CheckinSchedule }
> {
  const plan = await prisma.plan.findFirst({
    where: { id: planId, userId, deletedAt: null },
  });
  if (!plan) return { ok: false, code: 404, message: 'plan not found' };
  if (plan.archivedAt) {
    return { ok: false, code: 403, message: '已归档的计划不可提交打卡' };
  }
  const version = plan.confirmedVersion ?? plan.currentVersion ?? 1;
  const scheduleRows = (await prisma.$queryRawUnsafe(
    'SELECT schedule FROM "PlanVersion" WHERE "planId" = $1 AND version = $2 LIMIT 1',
    planId,
    version
  )) as Array<{ schedule: unknown | null }>;
  const schedule = scheduleRows[0]?.schedule as CheckinSchedule | null | undefined;
  if (!schedule || !Array.isArray(schedule.slots)) {
    return { ok: false, code: 404, message: 'schedule not found' };
  }
  return { ok: true, schedule };
}

function normalizeKind(input: string | undefined, fileName: string | undefined, url: string): string {
  if (input === 'image' || input === 'document' || input === 'other') return input;
  return inferAttachmentKind(fileName, url);
}

export async function listScheduleSlotSubmissionsBySlot(
  planId: string,
  userId: string
): Promise<Record<string, SerializedScheduleSlotSubmission[]>> {
  const rows = await prisma.planScheduleSlotSubmission.findMany({
    where: { planId, userId },
    orderBy: { createdAt: 'desc' },
    include: { attachments: true },
  });
  const bySlot: Record<string, SerializedScheduleSlotSubmission[]> = {};
  for (const r of rows) {
    const item: SerializedScheduleSlotSubmission = {
      id: r.id,
      content: r.content,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      attachments: r.attachments.map((a) => ({
        id: a.id,
        url: a.url,
        fileName: a.fileName,
        kind: a.kind,
        hash: a.hash,
        createdAt: a.createdAt.toISOString(),
      })),
    };
    if (!bySlot[r.slotKey]) bySlot[r.slotKey] = [];
    bySlot[r.slotKey].push(item);
  }
  return bySlot;
}

export async function createScheduleSlotCheckin(params: {
  planId: string;
  userId: string;
  slotKey: string;
  content?: string;
  attachments?: ScheduleSlotCheckinAttachmentInput[];
}): Promise<
  | { ok: false; code: 400 | 403 | 404; message: string }
  | { ok: false; code: 422; message: string; review: CheckinPublicReview }
  | { ok: true; submission: SerializedScheduleSlotSubmission }
> {
  const scheduleCtx = await loadPlanScheduleForUser(params.planId, params.userId);
  if (!scheduleCtx.ok) return scheduleCtx;

  const slot = scheduleCtx.schedule.slots.find((s) => s.slotKey === params.slotKey) as CheckinSlot | undefined;
  if (!slot) return { ok: false, code: 404, message: 'slot not found' };

  const content = (params.content ?? '').trim();
  const attachments = Array.isArray(params.attachments) ? params.attachments : [];
  const normalizedUrls = attachments
    .map((a) => ({
      url: typeof a.url === 'string' ? a.url.trim() : '',
      fileName: typeof a.fileName === 'string' ? a.fileName.trim() : undefined,
      kind: typeof a.kind === 'string' ? a.kind : undefined,
    }))
    .filter((a) => a.url.length > 0);

  if (!content && normalizedUrls.length === 0) {
    return { ok: false, code: 400, message: 'content or attachments required' };
  }

  // 附件文本提取：仅用于核验，不落库。限制数量/耗时，避免滥用。
  const MAX_ATTACHMENTS_FOR_EXTRACT = 5;
  const EXTRACT_MAX_BYTES = 2 * 1024 * 1024;
  const EXTRACT_PER_TIMEOUT_MS = 2000;
  const EXTRACT_TOTAL_BUDGET_MS = 6000;
  let attachmentExtractedText = "";
  try {
    const start = Date.now();
    const items = normalizedUrls.slice(0, MAX_ATTACHMENTS_FOR_EXTRACT);
    const parts: string[] = [];
    for (const a of items) {
      if (Date.now() - start > EXTRACT_TOTAL_BUDGET_MS) break;
      const r = await extractTextFromAttachmentUrl({
        url: a.url,
        timeoutMs: EXTRACT_PER_TIMEOUT_MS,
        maxBytes: EXTRACT_MAX_BYTES,
        maxChars: 1200,
      });
      if (r.ok && r.text.trim()) parts.push(r.text.trim());
    }
    attachmentExtractedText = parts.join("\n\n").slice(0, 3000);
  } catch {
    attachmentExtractedText = "";
  }

  const attachmentMeta = normalizedUrls.map((a) => ({
    fileName: a.fileName,
    kind: normalizeKind(a.kind, a.fileName, a.url),
  }));
  const { pass, review } = await evaluateCheckinSubmission({
    slot,
    userContent: content,
    attachmentCount: normalizedUrls.length,
    attachmentMeta,
    attachmentExtractedText,
  });
  if (!pass) {
    return {
      ok: false,
      code: 422,
      message: review.summary,
      review,
    };
  }

  const created = await prisma.planScheduleSlotSubmission.create({
    data: {
      planId: params.planId,
      slotKey: params.slotKey,
      userId: params.userId,
      content,
      status: 'submitted',
      ...(normalizedUrls.length > 0
        ? {
            attachments: {
              createMany: {
                data: normalizedUrls.map((a) => ({
                  url: a.url,
                  fileName: a.fileName ?? null,
                  kind: normalizeKind(a.kind, a.fileName, a.url),
                  hash: hashUrl(a.url),
                })),
              },
            },
          }
        : {}),
    },
    include: { attachments: true },
  });

  // 若该时间槽之前发起过申诉，但用户后来补齐证明并通过核验，应自动关闭申诉，避免 UI 长期停留在「申诉中」。
  await prisma.planScheduleSlotAppeal.updateMany({
    where: {
      planId: params.planId,
      userId: params.userId,
      slotKey: params.slotKey,
      status: "open",
    },
    data: { status: "closed" },
  });

  return {
    ok: true,
    submission: {
      id: created.id,
      content: created.content,
      status: created.status,
      createdAt: created.createdAt.toISOString(),
      attachments: created.attachments.map((a) => ({
        id: a.id,
        url: a.url,
        fileName: a.fileName,
        kind: a.kind,
        hash: a.hash,
        createdAt: a.createdAt.toISOString(),
      })),
    },
  };
}

/**
 * 申诉 AI 通过后直写成功提交（不再跑自动打分），与 createScheduleSlotCheckin 成功分支数据形状一致。
 */
export async function persistApprovedCheckinSubmission(params: {
  planId: string;
  userId: string;
  slotKey: string;
  content: string;
  attachments?: ScheduleSlotCheckinAttachmentInput[];
}): Promise<
  | { ok: false; code: 400 | 403 | 404; message: string }
  | { ok: true; submission: SerializedScheduleSlotSubmission }
> {
  const scheduleCtx = await loadPlanScheduleForUser(params.planId, params.userId);
  if (!scheduleCtx.ok) return scheduleCtx;

  const slot = scheduleCtx.schedule.slots.find((s) => s.slotKey === params.slotKey);
  if (!slot) return { ok: false, code: 404, message: 'slot not found' };

  const content = (params.content ?? '').trim();
  const attachments = Array.isArray(params.attachments) ? params.attachments : [];
  const normalizedUrls = attachments
    .map((a) => ({
      url: typeof a.url === 'string' ? a.url.trim() : '',
      fileName: typeof a.fileName === 'string' ? a.fileName.trim() : undefined,
      kind: typeof a.kind === 'string' ? a.kind : undefined,
    }))
    .filter((a) => a.url.length > 0);

  if (!content && normalizedUrls.length === 0) {
    return { ok: false, code: 400, message: 'content or attachments required' };
  }

  const created = await prisma.planScheduleSlotSubmission.create({
    data: {
      planId: params.planId,
      slotKey: params.slotKey,
      userId: params.userId,
      content,
      status: 'submitted',
      ...(normalizedUrls.length > 0
        ? {
            attachments: {
              createMany: {
                data: normalizedUrls.map((a) => ({
                  url: a.url,
                  fileName: a.fileName ?? null,
                  kind: normalizeKind(a.kind, a.fileName, a.url),
                  hash: hashUrl(a.url),
                })),
              },
            },
          }
        : {}),
    },
    include: { attachments: true },
  });

  // 保险：AI 采纳申诉自动建档时，同步关闭 open 申诉
  await prisma.planScheduleSlotAppeal.updateMany({
    where: {
      planId: params.planId,
      userId: params.userId,
      slotKey: params.slotKey,
      status: "open",
    },
    data: { status: "closed" },
  });

  return {
    ok: true,
    submission: {
      id: created.id,
      content: created.content,
      status: created.status,
      createdAt: created.createdAt.toISOString(),
      attachments: created.attachments.map((a) => ({
        id: a.id,
        url: a.url,
        fileName: a.fileName,
        kind: a.kind,
        hash: a.hash,
        createdAt: a.createdAt.toISOString(),
      })),
    },
  };
}
