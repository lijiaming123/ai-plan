import { afterEach, describe, expect, it, vi } from "vitest";
import {
  maybeRunUploadGarbageCollectionJob,
  resetUploadGcSchedulerForTests,
} from "../src/modules/uploads/upload-gc.service";

describe("upload gc scheduler", () => {
  afterEach(() => {
    resetUploadGcSchedulerForTests();
    vi.unstubAllEnvs();
  });

  it("非配置小时不执行", async () => {
    vi.stubEnv("UPLOAD_GC_LOCAL_HOUR", "3");
    const r = await maybeRunUploadGarbageCollectionJob(
      new Date("2026-05-09T12:00:00.000Z"),
    );
    expect(r.ran).toBe(false);
  });

  it("到达配置本地小时时执行一次；同日重复调用跳过", async () => {
    vi.stubEnv("UPLOAD_GC_LOCAL_HOUR", "3");
    // 2026-05-09T19:00:00.000Z = Asia/Shanghai 次日 03:00
    const t = new Date("2026-05-09T19:00:00.000Z");
    const first = await maybeRunUploadGarbageCollectionJob(t);
    expect(first.ran).toBe(true);
    expect(first.result?.deleted).toBeDefined();

    const second = await maybeRunUploadGarbageCollectionJob(t);
    expect(second.ran).toBe(false);
  });
});
