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
  const deleteCheckinMock = vi.fn();
  const publishMarketTemplateMock = vi.fn();
  const patchPlanMock = vi.fn();
  const archivePlanMock = vi.fn();

  beforeEach(() => {
    getPlanMock.mockReset();
    patchSlotMock.mockReset();
    postCheckinMock.mockReset();
    deleteCheckinMock.mockReset();
    publishMarketTemplateMock.mockReset();
    patchPlanMock.mockReset();
    archivePlanMock.mockReset();
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
      type: 'study',
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
    deleteCheckinMock.mockResolvedValue({ ok: true });
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
      deletePlanScheduleSlotCheckin: deleteCheckinMock,
      publishMarketTemplate: publishMarketTemplateMock,
      patchPlan: patchPlanMock,
      archivePlan: archivePlanMock,
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

  it('旅游类型应渲染行程时间轴布局（桌面端）', async () => {
    getPlanMock.mockResolvedValueOnce({
      id: 'plan_1',
      goal: '测试旅游计划',
      deadline: new Date().toISOString(),
      requirement: '正文',
      type: 'travel',
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

    expect(wrapper.find('[data-testid="travel-itinerary-timeline"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('第 1 天');
  });

  it('general 类型应渲染 checkbox-only 时间轴，并提供勾选完成与添加备注按钮', async () => {
    getPlanMock.mockResolvedValueOnce({
      id: 'plan_1',
      goal: '测试其它计划',
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

    expect(wrapper.find('[data-testid="general-checkbox-timeline"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="schedule-slot-general-toggle"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="schedule-slot-general-add-note"]').exists()).toBe(true);

    expect(wrapper.find('[data-testid="schedule-slot-checkin"]').exists()).toBe(false);
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

  it('归档确认弹窗应展示归档语义说明（只读 + 可恢复）', async () => {
    archivePlanMock.mockResolvedValue({ ok: true });

    const base = await getPlanMock.mock.results[0]?.value;
    getPlanMock
      .mockResolvedValueOnce({
        ...(base || {}),
        id: 'plan_1',
        goal: '测试计划',
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
              schedule: { granularity: 'day', slots: [] },
              stages: [],
            },
          ],
        },
        scheduleSlotSubmissions: {},
      })
      .mockResolvedValueOnce({
        ...(base || {}),
        id: 'plan_1',
        goal: '测试计划',
        requirement: '正文',
        type: 'general',
        status: 'archived',
        archivedAt: new Date().toISOString(),
        draft: null,
        scheduleSlotSubmissions: {},
      });

    const router = createAppRouter(createMemoryHistory());
    await router.push('/plans/plan_1');
    await router.isReady();

    const wrapper = mount(PlanDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    await wrapper.get('[data-testid="btn-archive-plan"]').trigger('click');
    await flushPromises();

    const dialog = wrapper.get('[data-testid="confirm-archive-dialog"]');
    expect(dialog.text()).toContain('将计划移入归档？');

    const explain = wrapper.get('[data-testid="archive-explain"]');
    expect(explain.text()).toContain('移出「我的计划」');
    expect(explain.text()).toContain('进入「归档」');
    expect(explain.text()).toContain('仅可查看');
    expect(explain.text()).toContain('不能打卡/编辑/申诉');
    expect(explain.text()).toContain('可随时「移回我的计划」');
  });

  it('归档成功后应提供“去归档看看”快捷入口并能跳转', async () => {
    archivePlanMock.mockResolvedValue({ ok: true });

    const base = await getPlanMock.mock.results[0]?.value;
    getPlanMock
      .mockResolvedValueOnce({
        ...(base || {}),
        id: 'plan_1',
        goal: '测试计划',
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
              schedule: { granularity: 'day', slots: [] },
              stages: [],
            },
          ],
        },
        scheduleSlotSubmissions: {},
      })
      .mockResolvedValueOnce({
        id: 'plan_1',
        goal: '测试计划',
        deadline: new Date().toISOString(),
        requirement: '正文',
        type: 'general',
        status: 'archived',
        archivedAt: new Date().toISOString(),
        draft: null,
        scheduleSlotSubmissions: {},
      });

    const router = createAppRouter(createMemoryHistory());
    await router.push('/plans/plan_1');
    await router.isReady();

    const wrapper = mount(PlanDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    await wrapper.get('[data-testid="btn-archive-plan"]').trigger('click');
    await flushPromises();
    await wrapper
      .get('[data-testid="confirm-archive-dialog"] [data-testid="ui-confirm-ok"]')
      .trigger('click');
    await flushPromises();

    expect(archivePlanMock).toHaveBeenCalledWith({ id: 'plan_1', token: 'token_123' });

    const banner = wrapper.get('[data-testid="plan-ok-banner"]');
    expect(banner.text()).toContain('已移入归档');
    expect(banner.text()).toContain('去归档看看');

    await wrapper.get('[data-testid="go-archive-from-banner"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/archive');
  });

  it('提交打卡证明后应发送 checkin_submit 埋点', async () => {
    getPlanMock.mockResolvedValueOnce({
      id: 'plan_1',
      goal: '测试计划',
      deadline: new Date().toISOString(),
      requirement: '正文',
      type: 'study',
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

  it('全部打卡段已提交且正文含下一步迭代方向时展示续航卡片与首次提示', async () => {
    const deadline = new Date().toISOString();
    const slotKey = '2026-05-09';
    getPlanMock.mockResolvedValueOnce({
      id: 'plan_done',
      goal: '父目标示例',
      deadline,
      requirement: '## 下一步迭代方向\n继续深入练习\n',
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
    // 弹窗为延迟动画出现
    await new Promise((r) => setTimeout(r, 260));
    await flushPromises();
    expect(wrapper.find('[data-testid="plan-continuation-hint-dialog"]').exists()).toBe(true);

    await wrapper.get('[data-testid="btn-quick-create-next-plan"]').trigger('click');
    await flushPromises();
    expect(push).toHaveBeenCalledWith({
      path: '/plans/new',
      query: { continuationFrom: 'plan_done' },
    });
  });

  it('正文无下一步迭代方向时不应弹窗，且输入区域默认收起', async () => {
    const deadline = new Date().toISOString();
    const slotKey = '2026-05-10';
    getPlanMock.mockResolvedValueOnce({
      id: 'plan_done_2',
      goal: '已完成计划',
      deadline,
      requirement: '正文',
      type: 'general',
      status: 'active',
      nextStep: '',
      parentPlan: null,
      draft: {
        confirmedVersion: 1,
        maxVersions: 3,
        canRegenerate: false,
        versions: [
          {
            version: 1,
            requirement: '正文',
            deadline,
            createdAt: deadline,
            schedule: {
              granularity: 'day',
              slots: [
                {
                  slotKey,
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
      scheduleSlotSubmissions: {
        [slotKey]: [
          { id: 's1', content: '完成', status: 'submitted', createdAt: deadline, attachments: [] },
        ],
      },
      scheduleSlotOpenAppeals: {},
    });

    const router = createAppRouter(createMemoryHistory());
    await router.push('/plans/plan_done_2');
    await router.isReady();

    const wrapper = mount(PlanDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    await new Promise((r) => setTimeout(r, 260));
    await flushPromises();
    expect(wrapper.find('[data-testid="plan-continuation-hint-dialog"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="plan-next-step-textarea"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="btn-expand-next-step"]').exists()).toBe(true);
  });

  it('已定稿计划应展示后续计划（childPlans）链接列表', async () => {
    const deadline = new Date().toISOString();
    getPlanMock.mockResolvedValueOnce({
      id: 'plan_parent',
      goal: '父计划',
      deadline,
      requirement: '正文',
      type: 'study',
      status: 'active',
      draft: {
        confirmedVersion: 1,
        maxVersions: 3,
        canRegenerate: false,
        versions: [
          {
            version: 1,
            requirement: '正文',
            deadline,
            createdAt: deadline,
            schedule: {
              granularity: 'day',
              slots: [
                {
                  slotKey: '2026-05-01',
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
      childPlans: [
        { id: 'child_a', goal: '子计划 A', createdAt: deadline },
        { id: 'child_b', goal: '子计划 B', createdAt: deadline },
      ],
    });

    const router = createAppRouter(createMemoryHistory());
    await router.push('/plans/plan_parent');
    await router.isReady();

    const wrapper = mount(PlanDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    const chain = wrapper.get('[data-testid="plan-detail-child-plans"]');
    expect(chain.text()).toContain('后续计划');
    expect(chain.text()).toContain('子计划 A');
    expect(chain.text()).toContain('子计划 B');
  });
});

