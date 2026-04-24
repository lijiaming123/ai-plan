import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 开发时 Admin API 反代目标（与 apps/api 的 PORT 一致，默认 3000） */
const defaultApiProxyTarget = 'http://127.0.0.1:3000';

/**
 * SPA 与 API 共用路径前缀 `/admin/*`（如 `/admin/dashboard`）。
 * 浏览器刷新会发 `Accept: text/html`，应回落到 `index.html`；XHR/fetch 再走代理。
 */
function bypassAdminProxyToSpa(req: IncomingMessage) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return;
  const accept = req.headers.accept ?? '';
  if (accept.includes('text/html')) {
    return '/index.html';
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const proxyTarget =
    process.env.VITE_API_PROXY_TARGET || env.VITE_API_PROXY_TARGET || defaultApiProxyTarget;

  return {
    plugins: [vue()],
    server: {
      proxy: {
        '/auth': { target: proxyTarget, changeOrigin: true },
        '/admin': { target: proxyTarget, changeOrigin: true, bypass: bypassAdminProxyToSpa },
        '/analytics': { target: proxyTarget, changeOrigin: true },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: [],
    },
  };
});
