import { describe, expect, it } from 'vitest';
import { planCreateSchema } from '../src/schemas';

describe('planCreateSchema', () => {
  it('在缺少目标时应校验失败', () => {
    const result = planCreateSchema.safeParse({
      deadline: '2026-12-31',
      requirement: '完成作品集',
      type: 'general',
    });
    expect(result.success).toBe(false);
  });
});
