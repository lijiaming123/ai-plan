import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import PlanDetailPage from '../src/features/plans/PlanDetailPage.vue';
import { createAppRouter } from '../src/router';
import { clearAuthToken, setAuthToken } from '../src/stores/auth';
import { setApiClient } from '../src/lib/api-client';

describe('PlanDetailPage schedule', () => {
  const getPlanMock = vi.fn();
  const patchSlotMock = vi.fn();

  beforeEach(() => {
    getPlanMock.mockReset();
    patchSlotMock.mockReset();
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

    setApiClient({
      login: vi.fn(),
      getAuthMe: vi.fn(),
      createPlan: vi.fn(),
      createSubmission: vi.fn(),
      planAssistant: vi.fn(),
      parsePlanFile: vi.fn(),
      getPlan: getPlanMock,
      getPlanDraft: vi.fn(),
      patchPlanScheduleSlot: patchSlotMock,
      regeneratePlan: vi.fn(),
      confirmPlan: vi.fn(),
      comparePlanVersions: vi.fn(),
      listPresets: vi.fn(),
      listMarketTemplates: vi.fn(),
      listMyMarketTemplates: vi.fn(),
      publishMarketTemplate: vi.fn(),
      likeMarketTemplate: vi.fn(),
      unlikeMarketTemplate: vi.fn(),
      favoriteMarketTemplate: vi.fn(),
      unfavoriteMarketTemplate: vi.fn(),
      applyPresetTemplate: vi.fn(),
      applyMarketTemplate: vi.fn(),
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

    await wrapper.get('button').trigger('click'); // 第一个按钮是“编辑”
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
});

