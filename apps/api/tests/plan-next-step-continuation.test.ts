import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import {
  extractNextStepFromRequirement,
  MAX_NEXT_STEP_LEN,
  sanitizePlanPatch,
} from '../src/modules/plans/plan.service';

function buildRequirementWithSchedule(
  textBeforeJson: string,
  slots: Array<{ slotKey: string; content: string }>,
) {
  return [
    textBeforeJson,
    '```json',
    JSON.stringify(
      { schedule: { granularity: 'day', slots } },
      null,
      2,
    ),
    '```',
  ].join('\n');
}

describe('plan next-step continuation', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('extractNextStepFromRequirement 应提取下一步迭代方向小节', () => {
    const md = [
      '## 总览',
      'abc',
      '## 下一步迭代方向',
      '先做 A，再做 B。',
      '## 其它',
      'tail',
    ].join('\n');
    expect(extractNextStepFromRequirement(md)).toBe('先做 A，再做 B。');
  });

  it('sanitizePlanPatch 允许 nextStep 并过滤非字符串', () => {
    expect(
      sanitizePlanPatch({
        nextStep: '  文本  ',
        nextStepInvalid: 1,
        goal: 'x',
      } as Record<string, unknown>),
    ).toEqual({ nextStep: '  文本  ' });
  });

  it('PATCH /plans/:id 更新 nextStep 超长应 400', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const req = buildRequirementWithSchedule('正文', [
      { slotKey: '2026-05-10', content: 'd1' },
    ]);
    const created = await app.inject({
      method: 'POST',
      url: '/plans',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: 'nextStep patch',
        deadline: '2026-05-10T00:00:00.000Z',
        requirement: req,
        type: 'general',
        profile: {
          planMode: 'basic',
          basicInfo: {
            planName: 't',
            planContent: 't',
            currentLevel: 'none',
            startDate: '2026-05-10',
            cycle: 'custom',
            endDate: '2026-05-10',
            preference: '',
            timeInvestment: 'none',
            outputMode: 'daily',
            granularityMode: 'deep',
          },
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const { id } = JSON.parse(created.body) as { id: string };

    await app.inject({
      method: 'POST',
      url: `/plans/${id}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: { version: 1 },
    });

    const tooLong = 'x'.repeat(MAX_NEXT_STEP_LEN + 1);
    const bad = await app.inject({
      method: 'PATCH',
      url: `/plans/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { nextStep: tooLong },
    });
    expect(bad.statusCode).toBe(400);

    await prisma.plan.deleteMany({ where: { id } });
  });

  it('POST /plans 携带无效 parentPlanId 应 404', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const res = await app.inject({
      method: 'POST',
      url: '/plans',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: 'child',
        deadline: '2026-05-10T00:00:00.000Z',
        requirement: 'x',
        type: 'general',
        parentPlanId: 'nonexistent-plan-id-xyz',
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('确认定稿时应写入解析的 nextStep 与续航 parentPlanId', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const parentReq = buildRequirementWithSchedule(
      ['## 下一步迭代方向', '父级留给子计划的提示。'].join('\n'),
      [{ slotKey: '2026-06-01', content: 'p1' }],
    );
    const parentCreate = await app.inject({
      method: 'POST',
      url: '/plans',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: 'parent plan',
        deadline: '2026-06-01T00:00:00.000Z',
        requirement: parentReq,
        type: 'general',
        profile: {
          planMode: 'basic',
          basicInfo: {
            planName: 'p',
            planContent: 'p',
            currentLevel: 'none',
            startDate: '2026-06-01',
            cycle: 'custom',
            endDate: '2026-06-01',
            preference: '',
            timeInvestment: 'none',
            outputMode: 'daily',
            granularityMode: 'deep',
          },
        },
      },
    });
    expect(parentCreate.statusCode).toBe(201);
    const parent = JSON.parse(parentCreate.body) as { id: string };

    await app.inject({
      method: 'POST',
      url: `/plans/${parent.id}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: { version: 1 },
    });

    const childReq = buildRequirementWithSchedule(
      ['### 下一步迭代方向', '子计划的迭代方向段落。'].join('\n'),
      [{ slotKey: '2026-06-02', content: 'c1' }],
    );
    const childCreate = await app.inject({
      method: 'POST',
      url: '/plans',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: 'child plan',
        deadline: '2026-06-02T00:00:00.000Z',
        requirement: childReq,
        type: 'general',
        parentPlanId: parent.id,
        profile: {
          planMode: 'basic',
          basicInfo: {
            planName: 'c',
            planContent: 'c',
            currentLevel: 'none',
            startDate: '2026-06-02',
            cycle: 'custom',
            endDate: '2026-06-02',
            preference: '',
            timeInvestment: 'none',
            outputMode: 'daily',
            granularityMode: 'deep',
          },
        },
      },
    });
    expect(childCreate.statusCode).toBe(201);
    const child = JSON.parse(childCreate.body) as { id: string };

    await app.inject({
      method: 'POST',
      url: `/plans/${child.id}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: { version: 1 },
    });

    const getParent = await app.inject({
      method: 'GET',
      url: `/plans/${parent.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getParent.statusCode).toBe(200);
    const parentRow = JSON.parse(getParent.body) as {
      nextStep: string | null;
      childPlans?: Array<{ id: string; goal: string }>;
    };
    expect(parentRow.nextStep).toBe('父级留给子计划的提示。');
    expect(parentRow.childPlans?.length).toBe(1);
    expect(parentRow.childPlans?.[0]?.id).toBe(child.id);
    expect(parentRow.childPlans?.[0]?.goal).toBe('child plan');

    const childReq2 = buildRequirementWithSchedule('第二子计划', [
      { slotKey: '2026-06-03', content: 'c2' },
    ]);
    const childCreate2 = await app.inject({
      method: 'POST',
      url: '/plans',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: 'child plan two',
        deadline: '2026-06-03T00:00:00.000Z',
        requirement: childReq2,
        type: 'general',
        parentPlanId: parent.id,
        profile: {
          planMode: 'basic',
          basicInfo: {
            planName: 'c2',
            planContent: 'c2',
            currentLevel: 'none',
            startDate: '2026-06-03',
            cycle: 'custom',
            endDate: '2026-06-03',
            preference: '',
            timeInvestment: 'none',
            outputMode: 'daily',
            granularityMode: 'deep',
          },
        },
      },
    });
    expect(childCreate2.statusCode).toBe(201);
    const child2 = JSON.parse(childCreate2.body) as { id: string };
    await app.inject({
      method: 'POST',
      url: `/plans/${child2.id}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: { version: 1 },
    });
    const getParent2 = await app.inject({
      method: 'GET',
      url: `/plans/${parent.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const parentAgain = JSON.parse(getParent2.body) as {
      childPlans?: Array<{ id: string; goal: string }>;
    };
    expect(parentAgain.childPlans?.map((c) => c.id)).toEqual([
      child.id,
      child2.id,
    ]);

    const getChild = await app.inject({
      method: 'GET',
      url: `/plans/${child.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getChild.statusCode).toBe(200);
    const childRow = JSON.parse(getChild.body) as {
      nextStep: string | null;
      parentPlanId: string | null;
      parentPlan: { id: string; goal: string } | null;
    };
    expect(childRow.parentPlanId).toBe(parent.id);
    expect(childRow.parentPlan?.id).toBe(parent.id);
    expect(childRow.parentPlan?.goal).toBe('parent plan');
    expect(childRow.nextStep).toBe('子计划的迭代方向段落。');

    await prisma.plan.deleteMany({
      where: { id: { in: [parent.id, child.id, child2.id] } },
    });
  });
});
