import { prisma } from '../../lib/prisma';
import { decideStatus } from './rules.engine';
import { recordEvaluationLatency } from '../../plugins/metrics';

export type EvaluateSubmissionInput = {
  submissionId: string;
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

function scoreContent(content: string, evidenceCount: number) {
  const trimmed = content.trim();
  const totalScore = Math.min(100, 70 + evidenceCount * 10 + (trimmed.length >= 10 ? 6 : 0));
  const riskScore = Math.max(0, 35 - evidenceCount * 7 - (trimmed.length >= 10 ? 5 : 0));
  return { totalScore, riskScore };
}

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
