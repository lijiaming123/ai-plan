import { PrismaClient } from '@prisma/client';

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
