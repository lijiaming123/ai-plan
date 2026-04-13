/**
 * Prisma Client 单例（全应用共用一个连接池）。
 *
 * - `DATABASE_URL`：标准 Postgres 连接串；未设置时使用 fallback，对齐本地 docker-compose / dev-up 默认库。
 * - 开发环境（NODE_ENV !== 'production'）把实例挂到 `globalThis`，避免 tsx watch / nodemon
 *   热重载时反复 `new PrismaClient()` 导致连接数飙升。
 * - `log: []` 关闭查询日志；调试 SQL 时可改为 `['query', 'error']`。
 *
 * Schema 与迁移见 `prisma/schema.prisma`，种子见 `prisma/seed.ts`。
 */
import { PrismaClient } from '@prisma/client';

/** 与 scripts/dev-up 默认 Postgres 容器一致，仅作本地开发兜底 */
const fallbackDatabaseUrl =
  'postgresql://postgres:postgres@localhost:5432/ai_plan?schema=public';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [],
    datasources: {
      db: {
        url: process.env.DATABASE_URL ?? fallbackDatabaseUrl,
      },
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
