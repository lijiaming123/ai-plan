import { describe, expect, it } from "vitest";
import { buildCheckinListSegments } from "../src/modules/plans/plan.service";

describe("buildCheckinListSegments", () => {
  it("按天：前两日已提交、当日未提交为 missed、未来为 upcoming", () => {
    const keys = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"];
    const sub = new Set(["2026-01-01", "2026-01-02"]);
    expect(
      buildCheckinListSegments({
        todayKey: "2026-01-03",
        granularity: "day",
        startDateYmd: "2026-01-01",
        slotKeysInOrder: keys,
        submittedSlotKeys: sub,
      }),
    ).toEqual(["done", "done", "missed", "upcoming"]);
  });

  it("按周：已提交周为 done，已结束未提交为 missed，未来周为 upcoming", () => {
    const keys = ["W1", "W2", "W3"];
    const sub = new Set(["W1"]);
    expect(
      buildCheckinListSegments({
        todayKey: "2026-01-20",
        granularity: "week",
        startDateYmd: "2026-01-01",
        slotKeysInOrder: keys,
        submittedSlotKeys: sub,
      }),
    ).toEqual(["done", "missed", "missed"]);
  });

  it("当周未提交记为 missed", () => {
    expect(
      buildCheckinListSegments({
        todayKey: "2026-01-10",
        granularity: "week",
        startDateYmd: "2026-01-01",
        slotKeysInOrder: ["W2"],
        submittedSlotKeys: new Set(),
      }),
    ).toEqual(["missed"]);
  });
});
