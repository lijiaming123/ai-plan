import { describe, expect, it } from "vitest";
import { buildPlanAssistantCacheKey } from "../src/modules/plans/assistant-cache-key";

describe("buildPlanAssistantCacheKey", () => {
  it("相同输入应生成相同 key", () => {
    const a = buildPlanAssistantCacheKey({
      mode: "draft",
      goal: "g",
      requirement: "r",
      startDate: "2026-04-10",
      endDate: "2026-05-10",
      cycle: "1m",
      granularityMode: "smart",
    });
    const b = buildPlanAssistantCacheKey({
      mode: "draft",
      goal: "g",
      requirement: "r",
      startDate: "2026-04-10",
      endDate: "2026-05-10",
      cycle: "1m",
      granularityMode: "smart",
    });
    expect(a).toBe(b);
  });

  it("memoryPrefix 变化应生成不同 key", () => {
    const a = buildPlanAssistantCacheKey({
      mode: "draft",
      goal: "g",
      requirement: "r",
      startDate: "2026-04-10",
      endDate: "2026-05-10",
      cycle: "1m",
      memoryPrefix: "m1",
    });
    const b = buildPlanAssistantCacheKey({
      mode: "draft",
      goal: "g",
      requirement: "r",
      startDate: "2026-04-10",
      endDate: "2026-05-10",
      cycle: "1m",
      memoryPrefix: "m2",
    });
    expect(a).not.toBe(b);
  });

  it("任一关键字段变化应生成不同 key", () => {
    const a = buildPlanAssistantCacheKey({
      mode: "chat",
      goal: "g",
      requirement: "r",
      startDate: "2026-04-10",
      endDate: "2026-05-10",
      cycle: "1m",
      message: "m1",
    });
    const b = buildPlanAssistantCacheKey({
      mode: "chat",
      goal: "g",
      requirement: "r",
      startDate: "2026-04-10",
      endDate: "2026-05-10",
      cycle: "1m",
      message: "m2",
    });
    expect(a).not.toBe(b);
  });
});

