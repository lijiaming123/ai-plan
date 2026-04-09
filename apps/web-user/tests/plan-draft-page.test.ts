import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import PlanDraftPage from '../src/features/plans/PlanDraftPage.vue';
import { createAppRouter } from '../src/router';
import { clearAuthToken, setAuthToken } from '../src/stores/auth';
import { setApiClient } from '../src/lib/api-client';

function mockMatchMediaDesktop() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: typeof query === 'string' && query.includes('min-width'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

describe('PlanDraftPage', () => {
  const getPlanMock = vi.fn();
  const getPlanDraftMock = vi.fn();
  const regeneratePlanMock = vi.fn();
  const confirmPlanMock = vi.fn();

  const draftPayload = {
    versions: [
      {
        version: 1,
        requirement: '需求 A',
        deadline: new Date().toISOString(),
        createdAt: '2026-04-01T10:00:00.000Z',
        stages: [
          {
            name: '第一阶段',
            sortOrder: 1,
            tasks: [{ id: 't1', title: '任务一', order: 1 }],
          },
        ],
      },
      {
        version: 2,
        requirement: '需求 B',
        deadline: new Date().toISOString(),
        createdAt: '2026-04-02T10:00:00.000Z',
        stages: [
          {
            name: '第二阶段',
            sortOrder: 1,
            tasks: [{ id: 't2', title: '任务二', order: 1 }],
          },
        ],
      },
    ],
    maxVersions: 3,
    confirmedVersion: null as number | null,
    canRegenerate: true,
  };

  beforeEach(() => {
    mockMatchMediaDesktop();
    getPlanMock.mockReset();
    getPlanDraftMock.mockReset();
    regeneratePlanMock.mockReset();
    confirmPlanMock.mockReset();

    getPlanMock.mockResolvedValue({
      id: 'plan_1',
      goal: '测试目标',
      deadline: new Date().toISOString(),
      requirement: '',
      type: 'general',
      status: 'draft',
    });
    getPlanDraftMock.mockResolvedValue({ ...draftPayload });
    regeneratePlanMock.mockResolvedValue({
      versions: draftPayload.versions,
      maxVersions: 3,
      confirmedVersion: null,
      canRegenerate: true,
    });
    confirmPlanMock.mockResolvedValue({
      plan: { id: 'plan_1', goal: '测试目标', status: 'active' },
      confirmedVersion: 2,
    });

    clearAuthToken();
    setAuthToken('token_123');
    setApiClient({
      login: vi.fn(),
      createPlan: vi.fn(),
      createSubmission: vi.fn(),
      planAssistant: vi.fn(),
      parsePlanFile: vi.fn(),
      getPlan: getPlanMock,
      getPlanDraft: getPlanDraftMock,
      regeneratePlan: regeneratePlanMock,
      confirmPlan: confirmPlanMock,
      comparePlanVersions: vi.fn(),
    });
  });

  it('应渲染草稿卡片并支持点击选中版本', async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push('/plans/plan_1/draft');
    await router.isReady();

    const wrapper = mount(PlanDraftPage, {
      global: { plugins: [router] },
      attachTo: document.body,
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="draft-card-v1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="draft-card-v2"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('任务一');
    expect(wrapper.text()).toContain('任务二');

    await wrapper.get('[data-testid="draft-card-v1"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="draft-regenerate"]').trigger('click');
    await flushPromises();

    expect(regeneratePlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'plan_1',
        requirement: '需求 A',
        token: 'token_123',
      })
    );
    wrapper.unmount();
  });

  it('点击确认应出现二次确认弹窗', async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push('/plans/plan_1/draft');
    await router.isReady();

    const wrapper = mount(PlanDraftPage, {
      global: { plugins: [router] },
      attachTo: document.body,
    });
    await flushPromises();

    expect(document.querySelector('[data-testid="draft-confirm-modal"]')).toBeNull();
    await wrapper.get('[data-testid="draft-open-confirm"]').trigger('click');
    await flushPromises();

    const modal = document.querySelector('[data-testid="draft-confirm-modal"]');
    expect(modal).not.toBeNull();
    expect(modal?.textContent ?? '').toContain('确认保存该版本');
    wrapper.unmount();
  });

  it('确认成功后应 router.push 到正式详情页', async () => {
    const router = createAppRouter(createMemoryHistory());
    const push = vi.spyOn(router, 'push');
    await router.push('/plans/plan_1/draft');
    await router.isReady();

    const wrapper = mount(PlanDraftPage, {
      global: { plugins: [router] },
      attachTo: document.body,
    });
    await flushPromises();

    await wrapper.get('[data-testid="draft-open-confirm"]').trigger('click');
    await flushPromises();
    (document.querySelector('[data-testid="draft-confirm-submit"]') as HTMLButtonElement | null)?.click();
    await flushPromises();

    expect(confirmPlanMock).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith({ name: 'plan-detail', params: { id: 'plan_1' } });
    wrapper.unmount();
  });

  it('getPlanDraft 返回 409 draft is closed 时应 router.replace 到详情页', async () => {
    getPlanDraftMock.mockRejectedValue(new Error('Request failed: 409 - draft is closed'));

    const router = createAppRouter(createMemoryHistory());
    const replace = vi.spyOn(router, 'replace');
    await router.push('/plans/plan_1/draft');
    await router.isReady();

    const w = mount(PlanDraftPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(replace).toHaveBeenCalledWith({ name: 'plan-detail', params: { id: 'plan_1' } });
    w.unmount();
  });

  it('计划已 active 时不应请求草稿接口并 replace 到详情页', async () => {
    getPlanMock.mockResolvedValue({
      id: 'plan_1',
      goal: '已激活',
      deadline: new Date().toISOString(),
      requirement: '',
      type: 'general',
      status: 'active',
    });

    const router = createAppRouter(createMemoryHistory());
    const replace = vi.spyOn(router, 'replace');
    await router.push('/plans/plan_1/draft');
    await router.isReady();

    const w = mount(PlanDraftPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(getPlanDraftMock).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith({ name: 'plan-detail', params: { id: 'plan_1' } });
    w.unmount();
  });
});
