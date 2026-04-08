import { evaluateSubmission } from './evaluation.service';

export async function processSubmissionEvaluation(submissionId: string) {
  return evaluateSubmission({ submissionId });
}
