import { describe, expect, it } from 'vitest';
import { createPlanRecord } from '../src/modules/plans/plan.repository';

describe('createPlanRecord', () => {
  it('应能创建计划记录', async () => {
    const plan = await createPlanRecord({
      userId: 'u1',
      goal: '完成产品演示',
      deadline: new Date('2026-09-01'),
      requirement: '交付 demo 和文档',
      type: 'general',
    });
    expect(plan.id).toBeTruthy();
  });
});
