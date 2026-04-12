import type { IncomingMessage } from 'node:http';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * 浏览器刷新 /plans、/auth/login 等前端路由时，请求为 GET + HTML 文档；
 * 若仍走代理会打到后端 API 导致 500/非 HTML。此类请求应回退到 SPA 入口。
 */
function bypassProxyForSpaDocument(req: IncomingMessage): string | undefined {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return undefined;
  }
  if (req.headers['sec-fetch-dest'] === 'document') {
    return '/index.html';
  }
  const accept = req.headers.accept ?? '';
  if (accept.includes('text/html')) {
    return '/index.html';
  }
  return undefined;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000';

  const apiProxy = {
    target: proxyTarget,
    changeOrigin: true,
    bypass: (req: IncomingMessage) => bypassProxyForSpaDocument(req),
  };

  return {
    plugins: [vue()],
    server: {
      proxy: {
        '/plans': apiProxy,
        '/auth': apiProxy,
        '/tasks': apiProxy,
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: [],
    },
  };
});
