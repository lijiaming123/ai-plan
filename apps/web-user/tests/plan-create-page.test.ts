import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import PlanCreatePage from '../src/features/plans/PlanCreatePage.vue';
import { createAppRouter } from '../src/router';
import { clearAuthToken, setAuthToken } from '../src/stores/auth';
import { setApiClient } from '../src/lib/api-client';

describe('PlanCreatePage', () => {
  beforeEach(() => {
    clearAuthToken();
    setApiClient({
      login: vi.fn(),
      createPlan: vi.fn().mockResolvedValue({
        id: 'plan_1',
        goal: '三个月完成作品集',
        deadline: new Date().toISOString(),
        requirement: '',
        type: 'general',
      }),
      createSubmission: vi.fn(),
    });
  });

  it('提交创建计划表单后应跳转到详情页', async () => {
    setAuthToken('token_123');
    const router = createAppRouter(createMemoryHistory());
    const push = vi.spyOn(router, 'push');
    const wrapper = mount(PlanCreatePage, {
      global: { plugins: [router] },
    });

    await wrapper.get('input[aria-label="目标"]').setValue('三个月完成作品集');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(push).toHaveBeenCalled();
  });

  it('未登录访问计划页时应跳转到登录页', async () => {
    const router = createAppRouter(createMemoryHistory());

    await router.push('/plans/new');
    await router.isReady();

    expect(router.currentRoute.value.fullPath).toBe('/auth/login');
  });
});
