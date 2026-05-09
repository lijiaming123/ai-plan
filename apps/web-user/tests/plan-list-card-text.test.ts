import { describe, expect, it } from "vitest";
import {
  buildPlanCardDisplayTexts,
  cardReadableRequirement,
  stripMarkdownToPlain,
} from "../src/lib/plan-list-card-text";

describe("plan-list-card-text", () => {
  it("stripMarkdownToPlain removes common markdown noise", () => {
    const raw =
      "**场景判断** ***类型**: 学习 ***依据**: `code` and [link](https://x)";
    expect(stripMarkdownToPlain(raw)).toBe(
      "场景判断 类型: 学习 依据: code and link",
    );
  });

  it("cardReadableRequirement drops scaffold and starts from 用户 when present", () => {
    const raw =
      "**场景判断*****类型**: 学习***依据**: 用户明确指定 「计划场景：学习」，目标为前端。";
    const out = cardReadableRequirement(raw);
    expect(out).toContain("用户明确指定");
    expect(out).not.toMatch(/\*\*/);
  });

  it("buildPlanCardDisplayTexts yields short cover and readable description", () => {
    const long =
      "**类型**: 备考 **依据**: 用户希望三个月内通过考试。第二句是补充说明，不应出现在封面一句里。";
    const { description, coverLine } = buildPlanCardDisplayTexts({
      requirement: long,
      type: "general",
      goal: "软考冲刺",
    });
    expect(coverLine).toContain("用户希望");
    expect(coverLine.endsWith("。")).toBe(true);
    expect(coverLine.length).toBeLessThanOrEqual(41);
    expect(description).not.toMatch(/\*\*/);
    expect(description.length).toBeLessThanOrEqual(161);
  });

  it("falls back to goal and type when requirement is empty", () => {
    const { description, coverLine } = buildPlanCardDisplayTexts({
      requirement: "   ",
      type: "study",
      goal: "前端学习路线",
    });
    expect(description).toContain("前端学习");
    expect(coverLine.length).toBeGreaterThan(0);
  });
});
