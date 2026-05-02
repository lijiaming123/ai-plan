import { defineConfig } from "prisma/config";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Prisma config (replaces deprecated package.json#prisma).
 *
 * Keep schema next to migrations under `apps/api/prisma/`.
 * Keep seed as existing TS entrypoint.
 */
// Prisma CLI 在检测到 prisma.config.ts 时会跳过自动 .env 加载；
// 这里手动加载 monorepo 根与 apps/api 的 .env，避免 migrate/dev 等命令缺少 DATABASE_URL。
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../.env") });
loadEnv({ path: path.resolve(__dirname, "./.env"), override: true });

export default defineConfig({
  schema: "./prisma/schema.prisma",
  seed: "node ../../node_modules/tsx/dist/cli.mjs prisma/seed.ts",
});

