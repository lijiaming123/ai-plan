export type DecideStatusInput = {
  totalScore: number;
  riskScore: number;
  evidenceCount: number;
  minEvidenceCount: number;
};

export function decideStatus(input: DecideStatusInput): 'completed' | 'needs_retry' {
  const isPassed =
    input.totalScore >= 80 &&
    input.riskScore <= 30 &&
    input.evidenceCount >= input.minEvidenceCount;

  return isPassed ? 'completed' : 'needs_retry';
}
