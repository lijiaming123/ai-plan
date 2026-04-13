/**
 * 提交自动评判（演示算法）。
 *
 * 流程：按 id 读 TaskSubmission + images → scoreContent 得总分/风险分 → decideStatus 得终态
 * → 写回 `taskSubmission.status` → recordEvaluationLatency。
 * 未记录中间审计日志；生产可接 LLM、人工队列或规则配置表 RuleConfig。
 */
import { prisma } from '../../lib/prisma';
import { decideStatus } from './rules.engine';
import { recordEvaluationLatency } from '../../plugins/metrics';

export type EvaluateSubmissionInput = {
  submissionId: string;
  /** 至少几张图算「证据充分」，默认 1；可与规则引擎阈值联动 */
  minEvidenceCount?: number;
};

export type EvaluationResult = {
  submissionId: string;
  totalScore: number;
  riskScore: number;
  evidenceCount: number;
  minEvidenceCount: number;
  status: 'completed' | 'needs_retry';
};

/**
 * 演示用打分：totalScore 越高越像「完成得好」，riskScore 越高越像「可疑/低质」。
 * 阈值与 decideStatus 中 80/30 等魔法数配套，调整时需同步改规则与单测。
 */
function scoreContent(content: string, evidenceCount: number) {
  const trimmed = content.trim();
  const totalScore = Math.min(100, 70 + evidenceCount * 10 + (trimmed.length >= 10 ? 6 : 0));
  const riskScore = Math.max(0, 35 - evidenceCount * 7 - (trimmed.length >= 10 ? 5 : 0));
  return { totalScore, riskScore };
}

/**
 * @throws 提交不存在时抛 Error（调用方应捕获或转 404）
 * @returns 评判结果摘要（含写入库后的 status）
 */
export async function evaluateSubmission(
  input: EvaluateSubmissionInput
): Promise<EvaluationResult> {
  const startedAt = Date.now();
  const submission = await prisma.taskSubmission.findUnique({
    where: { id: input.submissionId },
    include: { images: true },
  });

  if (!submission) {
    throw new Error(`Submission not found: ${input.submissionId}`);
  }

  const evidenceCount = submission.images.length;
  const { totalScore, riskScore } = scoreContent(submission.content, evidenceCount);
  const minEvidenceCount = input.minEvidenceCount ?? 1;
  const status = decideStatus({
    totalScore,
    riskScore,
    evidenceCount,
    minEvidenceCount,
  });

  await prisma.taskSubmission.update({
    where: { id: submission.id },
    data: { status },
  });

  recordEvaluationLatency(Date.now() - startedAt);

  return {
    submissionId: submission.id,
    totalScore,
    riskScore,
    evidenceCount,
    minEvidenceCount,
    status,
  };
}
