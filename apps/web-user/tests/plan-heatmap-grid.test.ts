import { describe, expect, it } from "vitest";
import {
  buildMonthLabelsForColumns,
  buildYearHeatmapColumns,
  startMondayOfCalendarYear,
} from "../src/lib/plan-heatmap-grid";

describe("plan-heatmap-grid", () => {
  it("startMondayOfCalendarYear(2026) 应为含元旦当周周一", () => {
    const m = startMondayOfCalendarYear(2026);
    expect(m.getFullYear()).toBe(2025);
    expect(m.getMonth()).toBe(11);
    expect(m.getDate()).toBe(29);
  });

  it("空数据时年内在格子数应等于该年天数", () => {
    const cols2026 = buildYearHeatmapColumns(2026, []);
    const inYear = cols2026
      .flat()
      .filter((c) => c.date != null && c.status !== "out");
    expect(inYear.length).toBe(365);
    expect(inYear.every((c) => c.status === "none")).toBe(true);

    const cols2024 = buildYearHeatmapColumns(2024, []);
    const inLeap = cols2024
      .flat()
      .filter((c) => c.date != null && c.status !== "out");
    expect(inLeap.length).toBe(366);
  });

  it("应合并接口返回的状态", () => {
    const cols = buildYearHeatmapColumns(2026, [
      { date: "2026-06-01", status: "completed", summary: { due: 1, done: 1 } },
      { date: "2026-06-02", status: "missed", summary: { due: 1, done: 0 } },
    ]);
    const flat = cols.flat();
    expect(flat.find((c) => c.date === "2026-06-01")?.status).toBe(
      "completed",
    );
    expect(flat.find((c) => c.date === "2026-06-02")?.status).toBe("missed");
  });

  it("buildMonthLabelsForColumns 应在首列出现月份名", () => {
    const cols = buildYearHeatmapColumns(2026, []);
    const labels = buildMonthLabelsForColumns(2026, cols);
    expect(labels.some((l) => l === "1月")).toBe(true);
    expect(labels.some((l) => l === "6月")).toBe(true);
  });
});
