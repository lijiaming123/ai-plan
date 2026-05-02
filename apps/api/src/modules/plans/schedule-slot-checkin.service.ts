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

  const attachmentMeta = normalizedUrls.map((a) => ({
    fileName: a.fileName,
    kind: normalizeKind(a.kind, a.fileName, a.url),
  }));
  const { pass, review } = await evaluateCheckinSubmission({
    slot,
    userContent: content,
    attachmentCount: normalizedUrls.length,
    attachmentMeta,
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
