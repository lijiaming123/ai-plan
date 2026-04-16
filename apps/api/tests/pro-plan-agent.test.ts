import { describe, expect, it } from 'vitest';
import { runProPlanAgent } from '@ai-plan/pro-plan-agent';

function fakeLlm(text: string) {
  return {
    complete: async () => ({ text }),
  } as any;
}

describe('pro-plan-agent (A/B)', () => {
  it('应生成 draft + review(issues/score) + revised + options', async () => {
    const draftText = [
      '这是正文（占位）',
      '```json',
      JSON.stringify({
        schedule: {
          granularity: 'week',
          slots: [{ slotKey: 'W1', content: '本周完成 1 个可验证动作，并记录证据。' }],
        },
      }),
      '```',
    ].join('\n');

    const res = await runProPlanAgent({
      input: {
        userId: 'u1',
        mode: 'draft',
        goal: '备考雅思',
        requirement: '目标 7.0，每周 5 小时',
        startDate: '2026-04-10',
        endDate: '2026-04-16',
        cycle: '1w',
        granularityMode: 'rough',
      },
      llm: fakeLlm(draftText),
    });

    expect(res.draft.suggestedContent.length).toBeGreaterThan(0);
    expect(res.draft.schedule.granularity).toBeDefined();
    expect(res.review.scoreTotal).toBeGreaterThanOrEqual(0);
    expect(res.review.scoreTotal).toBeLessThanOrEqual(100);
    expect(res.review.issues.length).toBeGreaterThan(0);
    expect(res.revised.suggestedContent.length).toBeGreaterThan(0);
    expect(res.options.length).toBeGreaterThan(0);
  });
});

