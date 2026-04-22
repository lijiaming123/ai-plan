import { describe, expect, it } from "vitest";
import { evaluateCheckinSubmission } from "../src/modules/plans/checkin-submission-score.service";
import type { CheckinSlot } from "../src/modules/plans/deepseek-schedule";

function slot(content: string): CheckinSlot {
  return {
    slotKey: "2026-01-01",
    generatedContent: content,
    content,
    contentSource: "generated",
  };
}

describe("checkin-submission-score", () => {
  it("附件 + 简短说明应可通过", async () => {
    const { pass, review } = await evaluateCheckinSubmission({
      slot: slot("第1天：阅读 RAG 文章并整理要点"),
      userContent: "今日已完成阅读并记录要点",
      attachmentCount: 1,
    });
    expect(pass).toBe(true);
    expect(review.passed).toBe(true);
  });

  it("极短且无附件应不通过", async () => {
    const { pass, review } = await evaluateCheckinSubmission({
      slot: slot("完成练习"),
      userContent: "ok",
      attachmentCount: 0,
    });
    expect(pass).toBe(false);
    expect(review.passed).toBe(false);
    expect(review.dimensions).toHaveLength(3);
  });
});
