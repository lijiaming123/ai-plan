import { describe, expect, it } from 'vitest';
import { planCreateSchema } from '@ai-plan/shared';

describe('planCreateSchema', () => {
  it('在缺少 goal 时应校验失败', () => {
    const result = planCreateSchema.safeParse({
      deadline: '2026-12-31T00:00:00+08:00',
      requirement: '完成作品集',
      type: 'general',
    });

    expect(result.success).toBe(false);
  });

  it('在字段完整且 deadline 合法时应校验通过', () => {
    const result = planCreateSchema.safeParse({
      goal: '完成作品集',
      deadline: '2026-12-31T00:00:00+08:00',
      requirement: '完成作品集并提交',
      type: 'general',
    });

    expect(result.success).toBe(true);
  });
});
