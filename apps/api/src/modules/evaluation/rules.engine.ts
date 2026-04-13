/**
 * 评判规则引擎（纯函数、无 IO）。
 *
 * 通过条件（全部满足）：totalScore≥80、riskScore≤30、evidenceCount≥minEvidenceCount。
 * 否则 needs_retry，便于前端提示用户补充材料；阈值硬编码，后续可从 RuleConfig 注入。
 */
export type DecideStatusInput = {
  totalScore: number;
  riskScore: number;
  evidenceCount: number;
  minEvidenceCount: number;
};

/** @returns completed=自动通过；needs_retry=需用户侧补充或人工复核 */
export function decideStatus(input: DecideStatusInput): 'completed' | 'needs_retry' {
  const isPassed =
    input.totalScore >= 80 &&
    input.riskScore <= 30 &&
    input.evidenceCount >= input.minEvidenceCount;

  return isPassed ? 'completed' : 'needs_retry';
}
