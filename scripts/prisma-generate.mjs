import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const isWindows = process.platform === "win32";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function run(cmd, args, options) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...options });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

/**
 * Windows 上 Prisma 引擎 dll 很容易被 node 进程占用，导致 generate 报 EPERM/EBUSY。
 * 这里做“有限次重试 + 清晰提示”，减少手工排查成本。
 */
async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const prismaCli = path.join(repoRoot, "node_modules", "prisma", "build", "index.js");
  const apiCwd = path.join(repoRoot, "apps", "api");

  const maxAttempts = Number(process.env.PRISMA_GENERATE_ATTEMPTS ?? 4);
  const backoffMs = [0, 800, 1600, 2400, 3200];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      const wait = backoffMs[Math.min(attempt - 1, backoffMs.length - 1)];
      console.warn(
        `[prisma-generate] retry ${attempt}/${maxAttempts} in ${wait}ms...`,
      );
      await sleep(wait);
    }

    const code = await run(process.execPath, [prismaCli, "generate"], {
      cwd: apiCwd,
      env: {
        ...process.env,
        PRISMA_HIDE_UPDATE_MESSAGE: "1",
      },
    });

    if (code === 0) return;

    if (attempt === maxAttempts) {
      console.error("");
      console.error("[prisma-generate] Failed.");
      if (isWindows) {
        console.error(
          "Windows likely cause: query_engine-windows.dll is locked (EPERM/EBUSY).",
        );
        console.error("Try in order:");
        console.error(
          "- Stop running API / tests / any node process that uses Prisma",
        );
        console.error("- Stop `pnpm dev:up` (or at least stop the api process)");
        console.error(
          "- Re-run: corepack pnpm --filter @ai-plan/api prisma:generate",
        );
        console.error("");
      }
      process.exit(code);
    }
  }
}

await main();
