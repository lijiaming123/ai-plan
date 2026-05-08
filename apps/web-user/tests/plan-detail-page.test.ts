import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createMemoryHistory } from 'vue-router';
const { trackEventMock, trackPageViewMock } = vi.hoisted(() => ({
  trackEventMock: vi.fn(),
  trackPageViewMock: vi.fn(),
}));

vi.mock('../src/lib/telemetry', () => ({
  trackEvent: trackEventMock,
  trackPageView: trackPageViewMock,
}));

import PlanDetailPage from '../src/features/plans/PlanDetailPage.vue';
import { createAppRouter } from '../src/router';
import { clearAuthToken, setAuthToken } from '../src/stores/auth';
import { createApiClient, setApiClient } from '../src/lib/api-client';

function demoJwt() {
  const payload = Buffer.from(JSON.stringify({ sub: 'user_demo', role: 'user' })).toString('base64');
  return `h.${payload}.s`;
}

describe('PlanDetailPage schedule', () => {
  const getPlanMock = vi.fn();
  const patchSlotMock = vi.fn();
  const postCheckinMock = vi.fn();
  const publishMarketTemplateMock = vi.fn();
  const patchPlanMock = vi.fn();

  beforeEach(() => {
    getPlanMock.mockReset();
    patchSlotMock.mockReset();
    postCheckinMock.mockReset();
    publishMarketTemplateMock.mockReset();
    patchPlanMock.mockReset();
    patchPlanMock.mockResolvedValue({ nextStep: null });
    trackEventMock.mockReset();
    trackPageViewMock.mockReset();
    localStorage.clear();
    clearAuthToken();
    setAuthToken('token_123');

    getPlanMock.mockResolvedValue({
      id: 'plan_1',
      goal: '测试计划',
      deadline: new Date().toISOString(),
      requirement: '正文',
      type: 'general',
      status: 'draft',
      draft: {
        confirmedVersion: null,
        maxVersions: 3,
        canRegenerate: true,
        versions: [
          {
            version: 1,
            requirement: '正文',
            deadline: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            schedule: {
              granularity: 'day',
              slots: [
                {
                  slotKey: '2026-04-10',
                  generatedContent: 'A',
                  content: 'A',
                  contentSource: 'generated',
                },
              ],
            },
            stages: [],
          },
        ],
      },
      scheduleSlotSubmissions: {},
    });

    patchSlotMock.mockResolvedValue({
      schedule: {
        granularity: 'day',
        slots: [
          {
            slotKey: '2026-04-10',
            generatedContent: 'A',
            content: 'B',
            contentSource: 'edited',
          },
        ],
      },
      slot: {
        slotKey: '2026-04-10',
        generatedContent: 'A',
        content: 'B',
        contentSource: 'edited',
      },
    });

    postCheckinMock.mockResolvedValue({
      submission: {
        id: 'sub_1',
        content: '完成',
        status: 'submitted',
        createdAt: new Date().toISOString(),
        attachments: [],
      },
    });
    publishMarketTemplateMock.mockResolvedValue({
      id: 'tpl_1',
      title: '模板',
      summary: '摘要',
    });

    setApiClient({
      ...createApiClient(),
      getPlan: getPlanMock,
      patchPlanScheduleSlot: patchSlotMock,
      postPlanScheduleSlotCheckin: postCheckinMock,
      publishMarketTemplate: publishMarketTemplateMock,
      patchPlan: patchPlanMock,
    });
  });

  it('应渲染 schedule 并支持编辑保存', async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push('/plans/plan_1');
    await router.isReady();

    const wrapper = mount(PlanDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('[data-testid="plan-schedule-panel"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('2026-04-10');
    expect(wrapper.text()).toContain('A');

    await wrapper.get('[data-testid="schedule-slot-edit"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="schedule-edit-dialog"]').exists()).toBe(true);

    await wrapper.get('textarea').setValue('B');
    await wrapper.get('[data-testid="schedule-edit-save"]').trigger('click');
    await flushPromises();

    expect(patchSlotMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'plan_1',
        slotKey: '2026-04-10',
        content: 'B',
        token: 'token_123',
      })
    );
    expect(wrapper.text()).toContain('B');
  });

  it('编辑弹窗应按 Escape 关闭', async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push('/plans/plan_1');
    await router.isReady();

    const wrapper = mount(PlanDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    await wrapper.get('[data-testid="schedule-slot-edit"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="schedule-edit-dialog"]').exists()).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(wrapper.find('[data-testid="schedule-edit-dialog"]').exists()).toBe(false);
  });

  it('提交打卡证明后应发送 checkin_submit 埋点', async () => {
    getPlanMock.mockResolvedValueOnce({
      id: 'plan_1',
      goal: '测试计划',
      deadline: new Date().toISOString(),
      requirement: '正文',
      type: 'general',
      status: 'active',
      draft: {
        confirmedVersion: 1,
        maxVersions: 3,
        canRegenerate: true,
        versions: [
          {
            version: 1,
            requirement: '正文',
            deadline: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            schedule: {
              granularity: 'day',
              slots: [
                {
                  slotKey: '2026-04-10',
                  generatedContent: 'A',
                  content: 'A',
                  contentSource: 'generated',
                },
              ],
            },
            stages: [],
          },
        ],
      },
      scheduleSlotSubmissions: {},
    });

    const router = createAppRouter(createMemoryHistory());
    await router.push('/plans/plan_1');
    await router.isReady();

    const wrapper = mount(PlanDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    await wrapper.get('[data-testid="schedule-slot-checkin"]').trigger('click');
    await flushPromises();
    await wrapper.get('#schedule-checkin-note').setValue('今天已完成');
    await wrapper.get('[data-testid="schedule-checkin-submit"]').trigger('click');
    await flushPromises();

    expect(postCheckinMock).toHaveBeenCalled();
    expect(trackEventMock).toHaveBeenCalledWith('checkin_submit', {
      properties: {
        planId: 'plan_1',
        slotKey: '2026-04-10',
      },
    });
  });

  it('发布模板后应发送 template_publish 埋点', async () => {
    clearAuthToken();
    setAuthToken(demoJwt());
    getPlanMock.mockResolvedValueOnce({
      id: 'plan_1',
      userId: 'user_demo',
      goal: '测试计划',
      deadline: new Date().toISOString(),
      requirement: '正文',
      type: 'general',
      status: 'active',
      draft: null,
      scheduleSlotSubmissions: {},
    });

    const router = createAppRouter(createMemoryHistory());
    const push = vi.spyOn(router, 'push');
    await router.push('/plans/plan_1');
    await router.isReady();

    const wrapper = mount(PlanDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    await wrapper.get('[data-testid="btn-publish-template"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="confirm-publish-template"]').trigger('click');
    await flushPromises();

    expect(publishMarketTemplateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: 'plan_1',
        category: 'general',
      }),
    );
    expect(trackEventMock).toHaveBeenCalledWith('template_publish', {
      properties: {
        planId: 'plan_1',
        templateId: 'tpl_1',
        category: 'general',
      },
    });
    expect(push).toHaveBeenCalledWith({ path: '/templates', query: { published: '1' } });
  });

  it('全部时间槽已提交且存在下一步迭代方向时展示续航卡片与首次提示', async () => {
    const deadline = new Date().toISOString();
    const slotKey = '2026-05-09';
    getPlanMock.mockResolvedValueOnce({
      id: 'plan_done',
      goal: '父目标示例',
      deadline,
      requirement: '',
      type: 'general',
      status: 'active',
      nextStep: '继续深入练习',
      parentPlan: null,
      draft: {
        confirmedVersion: 1,
        maxVersions: 3,
        canRegenerate: false,
        versions: [
          {
            version: 1,
            requirement: '',
            deadline,
            createdAt: deadline,
            schedule: {
              granularity: 'day',
              slots: [
                {
                  slotKey,
                  generatedContent: '打卡内容',
                  content: '打卡内容',
                  contentSource: 'generated',
                },
              ],
            },
            stages: [],
          },
        ],
      },
      scheduleSlotSubmissions: {
        [slotKey]: [
          {
            id: 's1',
            content: '已通过',
            status: 'passed',
            createdAt: deadline,
            attachments: [],
          },
        ],
      },
      scheduleSlotOpenAppeals: {},
    });

    const router = createAppRouter(createMemoryHistory());
    const push = vi.spyOn(router, 'push');
    await router.push('/plans/plan_done');
    await router.isReady();

    const wrapper = mount(PlanDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('[data-testid="plan-next-step-continuation-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="btn-quick-create-next-plan"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="plan-continuation-hint-dialog"]').exists()).toBe(true);

    await wrapper.get('[data-testid="btn-quick-create-next-plan"]').trigger('click');
    await flushPromises();
    expect(push).toHaveBeenCalledWith({
      path: '/plans/new',
      query: { continuationFrom: 'plan_done' },
    });
  });
});

