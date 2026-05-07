import { defineConfig } from "vitest/config";

/**
 * Monorepo test runner config.
 *
 * Each project keeps its own Vite/Vitest config:
 * - apps/web-user: uses apps/web-user/vite.config.ts (includes @vitejs/plugin-vue)
 * - apps/web-admin: uses apps/web-admin/vitest.config.mjs
 * - apps/api: uses defaults (no Vite config needed)
 */
export default defineConfig({
  test: {
    projects: ["apps/api", "apps/web-user", "apps/web-admin"],
    exclude: ["**/.worktrees/**"],
  },
});

