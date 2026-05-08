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

  it("要求流程图时：附件抽取文本命中关键术语可通过", async () => {
    const task = "阅读RAG入门文章，并绘制RAG流程图。";
    const { pass, review } = await evaluateCheckinSubmission({
      slot: slot(task),
      userContent: "见附件",
      attachmentCount: 1,
      attachmentExtractedText:
        "RAG pipeline: chunking -> embedding -> retriever -> generator",
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

  it("括号内顿号列举术语：分条解释+附件应通过（启发式）", async () => {
    const task =
      "阅读1-2篇RAG入门文章，记录核心术语（Embedding、向量数据库、Chunking、Retriever），并绘制RAG流程图。";
    const user =
      "Chunking是文本分块，Embedding是把文本转成向量，向量数据库存向量，Retriever负责检索。流程图已上传。";
    const { pass, review } = await evaluateCheckinSubmission({
      slot: slot(task),
      userContent: user,
      attachmentCount: 1,
    });
    expect(pass).toBe(true);
    expect(review.passed).toBe(true);
  });
});
