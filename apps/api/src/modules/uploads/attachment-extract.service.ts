import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { STORED_FILE_RE, getUploadRoot } from "./upload.service";
import mammoth from "mammoth";
import { createWorker } from "tesseract.js";

export type AttachmentExtractResult =
  | { ok: true; text: string; kind: "image" | "document" | "other"; mime?: string }
  | {
      ok: false;
      reason:
        | "disallowed_url"
        | "fetch_failed"
        | "too_large"
        | "timeout"
        | "unsupported"
        | "extract_failed";
    };

function safeTrimAndClamp(text: string, maxChars: number) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  return cleaned.slice(0, maxChars);
}

function parseAllowedFilesPath(rawUrl: string): { ok: true; name: string } | { ok: false } {
  // 允许：相对路径 /files/<name>；或同源绝对 URL，且 pathname 仍为 /files/<name>
  let pathname = "";
  try {
    if (rawUrl.startsWith("/")) {
      pathname = rawUrl;
    } else {
      const u = new URL(rawUrl);
      pathname = u.pathname;
    }
  } catch {
    return { ok: false };
  }
  if (!pathname.startsWith("/files/")) return { ok: false };
  const name = pathname.slice("/files/".length).trim();
  if (!STORED_FILE_RE.test(name)) return { ok: false };
  return { ok: true, name };
}

function ext(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

function classify(name: string): "image" | "document" | "other" {
  const e = ext(name);
  if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"].includes(e)) return "image";
  if ([".pdf", ".doc", ".docx", ".txt", ".md", ".csv"].includes(e)) return "document";
  return "other";
}

export async function extractTextFromAttachmentUrl(params: {
  url: string;
  timeoutMs: number;
  maxBytes: number;
  maxChars?: number;
}): Promise<AttachmentExtractResult> {
  const allowed = parseAllowedFilesPath(params.url);
  if (!allowed.ok) return { ok: false, reason: "disallowed_url" };

  const maxChars = Math.max(200, Math.min(8000, params.maxChars ?? 2500));
  const filePath = join(getUploadRoot(), allowed.name);

  // 本期仅实现“本地文件读取 + 基础文本类提取”；后续在 Task 3 加依赖扩展 PDF/OCR。
  let buf: Buffer;
  try {
    const s = await stat(filePath);
    if (s.size > params.maxBytes) return { ok: false, reason: "too_large" };
    buf = await readFile(filePath);
  } catch {
    return { ok: false, reason: "fetch_failed" };
  }

  const kind = classify(allowed.name);
  const e = ext(allowed.name);
  if (kind === "document" && [".txt", ".md", ".csv"].includes(e)) {
    const text = safeTrimAndClamp(buf.toString("utf8"), maxChars);
    return { ok: true, text, kind: "document" };
  }

  // 解析器：尽量提取“可对照的文本”，失败则回空串，由上层回退为用户说明核验。
  const withTimeout = async <T>(fn: () => Promise<T>): Promise<T> => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), Math.max(50, params.timeoutMs));
    try {
      // 仅用于统一超时：底层库未必支持 signal，但 promise.race 可保证返回
      return await Promise.race([
        fn(),
        new Promise<T>((_, reject) =>
          ac.signal.addEventListener("abort", () => reject(new Error("timeout"))),
        ),
      ]);
    } finally {
      clearTimeout(t);
    }
  };

  try {
    if (e === ".docx") {
      const r = await withTimeout(() => mammoth.extractRawText({ buffer: buf }));
      return { ok: true, text: safeTrimAndClamp(r.value ?? "", maxChars), kind: "document" };
    }
    if (e === ".pdf") {
      const mod = (await import("pdf-parse")) as unknown as {
        default?: (data: Buffer) => Promise<{ text?: string }>;
      };
      const pdfParse = mod.default;
      if (!pdfParse) return { ok: false, reason: "extract_failed" };
      const r = (await withTimeout(() => pdfParse(buf))) as { text?: string };
      return {
        ok: true,
        text: safeTrimAndClamp(r.text ?? "", maxChars),
        kind: "document",
      };
    }
    if (kind === "image") {
      // OCR 成本较高：仅提取文字，不尝试“理解图结构”
      const worker = await withTimeout(async () => {
        const w = await createWorker("eng");
        return w;
      });
      const out = await withTimeout(async () => {
        const res = await worker.recognize(buf);
        return res.data.text ?? "";
      });
      await worker.terminate();
      return { ok: true, text: safeTrimAndClamp(out, maxChars), kind: "image" };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "extract failed";
    if (msg.toLowerCase().includes("timeout")) return { ok: false, reason: "timeout" };
    return { ok: false, reason: "extract_failed" };
  }

  return { ok: true, text: "", kind };
}

