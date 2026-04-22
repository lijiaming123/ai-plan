/**
 * API 进程入口。
 *
 * 职责概览：
 * 1. 按顺序加载环境变量：先仓库根 `.env`，再 `apps/api/.env`（后者同名变量覆盖前者），便于本地与部署各写一份。
 * 2. 非生产环境打印 DeepSeek 是否已配置，避免误以为 AI 路由异常实为未配 KEY。
 * 3. `buildApp()` 创建 Fastify 实例并注册全部插件与路由；最后 `listen` 绑定 `0.0.0.0` 便于容器/局域网访问。
 *
 * 常用环境变量：PORT、DATABASE_URL、JWT_SECRET、DEEPSEEK_*（见 lib/deepseek.ts）、
 * UPLOAD_DIR（可选，用户上传文件目录，默认 apps/api/data/uploads）。
 */
import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepseekConfigured } from './lib/deepseek';
import { buildApp } from './app';
import { runCheckinReminderJob } from './modules/notifications/checkin-reminder.service';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiPackageRoot = resolve(__dirname, '..');
const repoRoot = resolve(__dirname, '../../..');
// 先加载 monorepo 根 .env，再加载本包 .env；override 保证 apps/api 专用配置优先生效
loadEnv({ path: resolve(repoRoot, '.env') });
loadEnv({ path: resolve(apiPackageRoot, '.env'), override: true });

if (process.env.NODE_ENV !== 'production') {
  const deepseekOn = isDeepseekConfigured();
  console.log(
    `[api] DeepSeek：${deepseekOn ? '已配置 DEEPSEEK_API_KEY，/plans/assistant 将走云端' : '未配置 — 请在 apps/api/.env 或仓库根 .env 设置 DEEPSEEK_API_KEY 后重启 API'}`,
  );
}

const app = buildApp();

const port = Number(process.env.PORT ?? 3000);
void app
  .listen({ port, host: '0.0.0.0' })
  .then(() => {
    if (process.env.NODE_ENV === 'test') return;
    const ms = 5 * 60 * 1000;
    setInterval(() => {
      void runCheckinReminderJob().catch((err) => {
        console.error('[checkin-reminder]', err);
      });
    }, ms);
    void runCheckinReminderJob().catch((err) => {
      console.error('[checkin-reminder:initial]', err);
    });
  });
