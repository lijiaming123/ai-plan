import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "../../lib/prisma";
import { getUploadRoot } from "./upload.service";

let lastUploadGcYmd: string | null = null;

/** 单测中重置「每日只跑一次」状态 */
export function resetUploadGcSchedulerForTests() {
  lastUploadGcYmd = null;
}

export function getUploadGcConfigFromEnv() {
  const hourRaw = Number(process.env.UPLOAD_GC_LOCAL_HOUR ?? 3);
  const retentionRaw = Number(process.env.UPLOAD_GC_RETENTION_DAYS ?? 3);
  const limitRaw = Number(process.env.UPLOAD_GC_BATCH_LIMIT ?? 200);
  const backlogRaw = Number(process.env.UPLOAD_GC_WARN_BACKLOG ?? 500);
  return {
    timeZone: process.env.UPLOAD_GC_TIMEZONE?.trim() || "Asia/Shanghai",
    runAtLocalHour: Number.isFinite(hourRaw)
      ? Math.max(0, Math.min(23, hourRaw))
      : 3,
    retentionDays: Number.isFinite(retentionRaw)
      ? Math.max(1, Math.min(90, retentionRaw))
      : 3,
    limit: Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, limitRaw)) : 200,
    warnBacklog: Number.isFinite(backlogRaw) ? Math.max(0, backlogRaw) : 500,
  };
}

/**
 * 进程内定时任务：在配置时区的整点小时触发一次/自然日（默认凌晨 3 点），
 * 清理「早于保留天数且仍未被引用」的上传；批量打满或积压过大时打 warn 日志。
 */
export async function maybeRunUploadGarbageCollectionJob(now: Date = new Date()): Promise<{
  ran: boolean;
  result?: {
    scanned: number;
    deleted: number;
    batchFull: boolean;
    backlog: number;
    warn: boolean;
  };
}> {
  const cfg = getUploadGcConfigFromEnv();
  const ymd = formatInTimeZone(now, cfg.timeZone, "yyyy-MM-dd");
  const hour = parseInt(formatInTimeZone(now, cfg.timeZone, "H"), 10);
  if (!Number.isFinite(hour) || hour !== cfg.runAtLocalHour) {
    return { ran: false };
  }
  if (lastUploadGcYmd === ymd) return { ran: false };
  lastUploadGcYmd = ymd;

  const olderThan = new Date(
    now.getTime() - cfg.retentionDays * 24 * 60 * 60 * 1000,
  );
  const { scanned, deleted, batchFull } = await runUploadGarbageCollector({
    olderThan,
    limit: cfg.limit,
  });

  const uploadedFileDelegate = (prisma as any).uploadedFile as
    | { count: (args: unknown) => Promise<number> }
    | undefined;
  let backlog = 0;
  if (uploadedFileDelegate) {
    try {
      backlog = await uploadedFileDelegate.count({
        where: {
          deletedAt: null,
          referencedAt: null,
          createdAt: { lt: olderThan },
        },
      });
    } catch {
      backlog = 0;
    }
  }

  const warn = backlog > cfg.warnBacklog || batchFull;
  if (warn) {
    console.warn(
      `[upload-gc] 告警：deleted=${deleted} scanned=${scanned} backlog≈${backlog} batchFull=${batchFull}`,
    );
  } else {
    console.log(
      `[upload-gc] 完成：deleted=${deleted} scanned=${scanned} backlog≈${backlog}`,
    );
  }

  return {
    ran: true,
    result: { scanned, deleted, batchFull, backlog, warn },
  };
}

export async function runUploadGarbageCollector(params: {
  /** 早于该时间且未被引用的上传将被清理 */
  olderThan: Date;
  /** 单次最多清理多少条，避免任务过长 */
  limit?: number;
}): Promise<{ scanned: number; deleted: number; batchFull: boolean }> {
  const uploadedFileDelegate = (prisma as any).uploadedFile as
    | {
        findMany: Function;
        update: Function;
      }
    | undefined;
  if (!uploadedFileDelegate) return { scanned: 0, deleted: 0, batchFull: false };

  const limit = Math.max(1, Math.min(500, params.limit ?? 200));
  const olderThan = params.olderThan;

  const candidates = await uploadedFileDelegate.findMany({
    where: {
      deletedAt: null,
      referencedAt: null,
      createdAt: { lt: olderThan },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, storageName: true },
  });

  let deleted = 0;
  const root = getUploadRoot();

  for (const row of candidates as Array<{ id: string; storageName: string }>) {
    const filePath = join(root, row.storageName);
    try {
      await unlink(filePath);
    } catch {
      // 文件不存在/无权限：继续标记 deletedAt，避免重复扫描卡住
    }
    try {
      await uploadedFileDelegate.update({
        where: { id: row.id },
        data: { deletedAt: new Date() },
      });
    } catch {
      // ignore
    }
    deleted += 1;
  }

  const batchFull = candidates.length >= limit;
  return { scanned: candidates.length, deleted, batchFull };
}

