import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepseekConfigured } from './lib/deepseek';
import { buildApp } from './app';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiPackageRoot = resolve(__dirname, '..');
const repoRoot = resolve(__dirname, '../../..');
// 仓库根 .env → apps/api/.env（后者同名变量优先）
loadEnv({ path: resolve(repoRoot, '.env') });
loadEnv({ path: resolve(apiPackageRoot, '.env'), override: true });

if (process.env.NODE_ENV !== 'production') {
  const deepseekOn = isDeepseekConfigured();
  console.log(
    `[api] DeepSeek：${deepseekOn ? '已配置 DEEPSEEK_API_KEY，/plans/assistant 将走云端' : '未配置 — 请在 apps/api/.env 或仓库根 .env 设置 DEEPSEEK_API_KEY 后重启 API'}`,
  );
}

const app = buildApp();

app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
