import { prisma } from "../../lib/prisma";
import { tryParseStoredFileName } from "./upload.service";

/**
 * 将本系统 /files/<storageName> 对应的上传记录标记为已被业务引用（避免孤儿文件 GC 误删）。
 * referencedBy 可为打卡 submissionId，或 `appeal:<appealId>`。
 */
export async function markUploadedFilesReferenced(params: {
  userId: string;
  urls: string[];
  referencedBy: string;
}): Promise<void> {
  const names = params.urls
    .map((u) => tryParseStoredFileName(u))
    .filter((x): x is string => Boolean(x));
  if (!names.length) return;
  try {
    await (prisma as any).uploadedFile.updateMany({
      where: {
        userId: params.userId,
        storageName: { in: names },
        deletedAt: null,
        referencedAt: null,
      },
      data: {
        referencedAt: new Date(),
        referencedBy: params.referencedBy,
      },
    });
  } catch {
    /* 引用标记失败不应影响主流程 */
  }
}
