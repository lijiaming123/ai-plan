import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import {
  STORED_FILE_RE,
  buildPublicFileUrl,
  extToContentType,
  getUploadRoot,
  saveUploadedFile,
} from './upload.service';

/**
 * POST /uploads：multipart 单文件，字段名 `file`，需登录。
 * GET /files/:name：公开读取（文件名不可猜测）；仅允许仓库内生成的存储名格式。
 */
export async function registerUploadRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/uploads',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ message: 'file field required' });
      }
      const mime = data.mimetype.split(';')[0]?.trim().toLowerCase() ?? '';
      try {
        const saved = await saveUploadedFile({
          mimetype: mime,
          filename: data.filename,
          file: data.file,
        });
        const { path, url } = buildPublicFileUrl(request, saved.storageName);
        return reply.send({
          path,
          url,
          fileName: saved.originalName,
          kind: saved.kind,
        });
      } catch (e) {
        if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'UNSUPPORTED_TYPE') {
          return reply.code(415).send({ message: 'unsupported file type' });
        }
        throw e;
      }
    }
  );

  fastify.get<{ Params: { name: string } }>('/files/:name', async (request, reply) => {
    const name = request.params.name;
    if (!STORED_FILE_RE.test(name)) {
      return reply.code(404).send({ message: 'not found' });
    }
    const filePath = join(getUploadRoot(), name);
    try {
      await stat(filePath);
    } catch {
      return reply.code(404).send({ message: 'not found' });
    }
    reply.header('Content-Type', extToContentType(name));
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(createReadStream(filePath));
  });
}
