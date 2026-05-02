/**
 * 用户上传文件落盘与公开读取路径（无 JWT，依赖不可猜测的文件名）。
 * 生产环境建议配置 UPLOAD_DIR 持久卷，并在网关将 /files 反代到 API。
 */
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import type { FastifyRequest } from 'fastify';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'text/csv': '.csv',
};

const ALLOWED_MIMES = new Set(Object.keys(MIME_TO_EXT));

/** 磁盘文件名：仅 UUID + 白名单扩展名，供 GET /files 校验 */
export const STORED_FILE_RE =
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.(jpg|png|gif|webp|pdf|doc|docx|txt|md|csv)$/i;

export function getUploadRoot(): string {
  const env = process.env.UPLOAD_DIR?.trim();
  if (env) return resolve(env);
  const apiPackageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  return join(apiPackageRoot, 'data', 'uploads');
}

export function inferKindFromMime(mime: string): 'image' | 'document' | 'other' {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf' || mime.includes('word') || mime === 'text/plain' || mime === 'text/markdown') {
    return 'document';
  }
  return 'other';
}

export async function saveUploadedFile(params: {
  mimetype: string;
  filename?: string;
  file: NodeJS.ReadableStream;
}): Promise<{ storageName: string; originalName: string; kind: 'image' | 'document' | 'other' }> {
  const mime = params.mimetype.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!ALLOWED_MIMES.has(mime)) {
    const err = new Error('unsupported file type');
    (err as Error & { code: string }).code = 'UNSUPPORTED_TYPE';
    throw err;
  }
  const ext = MIME_TO_EXT[mime]!;
  const storageName = `${randomUUID()}${ext}`;
  const root = getUploadRoot();
  await mkdir(root, { recursive: true });
  const dest = join(root, storageName);
  await pipeline(params.file, createWriteStream(dest));
  const safeOriginal = (params.filename ?? storageName).replace(/[/\\]/g, '_').slice(0, 200);
  return {
    storageName,
    originalName: safeOriginal || storageName,
    kind: inferKindFromMime(mime),
  };
}

export function buildPublicFileUrl(request: FastifyRequest, storageName: string): { path: string; url: string } {
  const path = `/files/${storageName}`;
  const rawHost = request.headers['x-forwarded-host'] ?? request.headers.host;
  const host = typeof rawHost === 'string' ? rawHost.split(',')[0].trim() : '';
  if (!host) {
    return { path, url: path };
  }
  const rawProto = request.headers['x-forwarded-proto'];
  let proto = typeof rawProto === 'string' ? rawProto.split(',')[0].trim() : '';
  if (!proto && request.protocol) {
    proto = String(request.protocol).replace(/:$/, '');
  }
  const scheme = proto.includes('https') ? 'https' : 'http';
  return { path, url: `${scheme}://${host}${path}` };
}

export function extToContentType(storageName: string): string {
  const ext = storageName.slice(storageName.lastIndexOf('.')).toLowerCase();
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
  };
  return map[ext] ?? 'application/octet-stream';
}
