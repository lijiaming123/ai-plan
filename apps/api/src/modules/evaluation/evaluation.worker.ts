/**
 * 评判任务入口的薄封装：与 evaluation.service 解耦，便于将来接 BullMQ / pg_notify / 定时轮询时只改此处。
 * 当前实现为同步转调，无重试与死信队列。
 */
import { evaluateSubmission } from './evaluation.service';

/** @param submissionId TaskSubmission 主键 */
export async function processSubmissionEvaluation(submissionId: string) {
  return evaluateSubmission({ submissionId });
}
