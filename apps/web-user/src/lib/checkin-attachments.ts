/** 打卡附件校验与合并（PlanDetail 等共用） */

export const CHECKIN_MAX_FILES = 12;
export const CHECKIN_MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

const CHECKIN_ALLOWED_MIME_PREFIX = ["image/", "application/pdf", "text/"] as const;

const CHECKIN_ALLOWED_EXT = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".pdf",
  ".doc",
  ".docx",
  ".txt",
  ".md",
  ".csv",
] as const;

export function isAllowedCheckinFile(file: File): boolean {
  if (CHECKIN_ALLOWED_MIME_PREFIX.some((p) => file.type.startsWith(p))) return true;
  const name = (file.name ?? "").toLowerCase();
  return CHECKIN_ALLOWED_EXT.some((ext) => name.endsWith(ext));
}

export function normalizeHttpsUrl(input: string): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export type CheckinAttachmentRow = { url: string; fileName?: string };

export function mergeCheckinAttachments(params: {
  uploaded: CheckinAttachmentRow[];
  manualLinks: Array<{ url: string; fileName?: string }>;
  maxFiles?: number;
}): CheckinAttachmentRow[] {
  const max = params.maxFiles ?? CHECKIN_MAX_FILES;
  const manual = params.manualLinks
    .map((a) => {
      const url = normalizeHttpsUrl(a.url);
      const fileName = (a.fileName ?? "").trim() || undefined;
      return { url, fileName };
    })
    .filter((a) => Boolean(a.url)) as CheckinAttachmentRow[];

  const invalidManualCount = params.manualLinks.filter((r) => {
    const raw = (r.url ?? "").trim();
    return raw.length > 0 && !normalizeHttpsUrl(raw);
  }).length;
  if (invalidManualCount > 0) {
    throw new Error(
      "手动链接仅支持可访问的 https 链接（请检查是否缺少 https:// 或链接格式不正确）",
    );
  }

  const all = [...params.uploaded, ...manual];
  const uniq: CheckinAttachmentRow[] = [];
  const seen = new Set<string>();
  for (const a of all) {
    if (!a.url) continue;
    if (seen.has(a.url)) continue;
    seen.add(a.url);
    uniq.push(a);
  }
  return uniq.slice(0, max);
}
