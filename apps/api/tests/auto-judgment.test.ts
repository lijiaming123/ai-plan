import { describe, expect, it } from 'vitest';
import { createSubmission } from '../src/modules/submissions/submission.service';
import { evaluateSubmission } from '../src/modules/evaluation/evaluation.service';
import { decideStatus } from '../src/modules/evaluation/rules.engine';

describe('decideStatus', () => {
  it('当分数和风险满足阈值时应标记为完成', () => {
    const status = decideStatus({
      totalScore: 86,
      riskScore: 24,
      evidenceCount: 2,
      minEvidenceCount: 1,
    });

    expect(status).toBe('completed');
  });

  it('评估通过后应将提交状态写回 completed', async () => {
    const submission = await createSubmission({
      taskId: 'task_eval_1',
      userId: 'user_demo',
      content: '完成了第 1 章和第 2 章，并整理了学习笔记',
      imageUrls: ['https://cdn.test/1.png', 'https://cdn.test/2.png'],
    });

    const result = await evaluateSubmission({ submissionId: submission.id });

    expect(result.status).toBe('completed');
    expect(result.totalScore).toBeGreaterThanOrEqual(80);
  });

  it('证据不足时应标记为 needs_retry', async () => {
    const submission = await createSubmission({
      taskId: 'task_eval_2',
      userId: 'user_demo',
      content: '完成了第 1 章',
      imageUrls: ['https://cdn.test/3.png'],
    });

    const result = await evaluateSubmission({
      submissionId: submission.id,
      minEvidenceCount: 3,
    });

    expect(result.status).toBe('needs_retry');
  });
});
