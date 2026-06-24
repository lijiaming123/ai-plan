import type { IncomingMessage } from "node:http";
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";

/**
 * 浏览器刷新 /plans、/auth/login 等前端路由时，请求为 GET + HTML 文档；
 * 若仍走代理会打到后端 API 导致 500/非 HTML。此类请求应回退到 SPA 入口。
 */
function bypassProxyForSpaDocument(req: IncomingMessage): string | undefined {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return undefined;
  }
  if (req.headers["sec-fetch-dest"] === "document") {
    return "/index.html";
  }
  const accept = req.headers.accept ?? "";
  if (accept.includes("text/html")) {
    return "/index.html";
  }
  return undefined;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_API_PROXY_TARGET || "http://127.0.0.1:3000";

  const apiProxy = {
    target: proxyTarget,
    changeOrigin: true,
    bypass: (req: IncomingMessage) => bypassProxyForSpaDocument(req),
  };

  return {
    plugins: [
      vue(),
      AutoImport({
        resolvers: [ElementPlusResolver()],
        dts: "src/auto-imports.d.ts",
      }),
      Components({
        resolvers: [
          ElementPlusResolver({
            importStyle: "css",
          }),
        ],
        dts: "src/components.d.ts",
      }),
    ],
    server: {
      proxy: {
        "/plans": apiProxy,
        "/me": apiProxy,
        "/auth": apiProxy,
        "/tasks": apiProxy,
        "/uploads": apiProxy,
        "/files": apiProxy,
      },
      port: 5200,
      host: "0.0.0.0",
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: [],
      exclude: ["**/.worktrees/**"],
      env: {
        /** 单元测试仍覆盖模板域；生产 MVP 默认不设置此项即为关闭 */
        VITE_FEATURE_TEMPLATES: "true",
      },
      // 路由懒加载会触发更多动态编译/预处理，CI 或冷启动下可能超过默认 5s
      testTimeout: 15000,
      server: {
        deps: {
          // 按需样式会 import .css；inline 后走 Vite 转换，避免 Node 直接读 .css 报错
          inline: ["element-plus"],
        },
      },
    },
  };
});
