import { beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import { createAppRouter } from '../src/router';
import { clearAuthToken, setAuthToken } from '../src/stores/auth';
import ForgotPasswordPage from '../src/features/auth/ForgotPasswordPage.vue';
import PlanOverviewPage from '../src/features/plans/PlanOverviewPage.vue';

describe('stitch pages routing and rendering', () => {
  beforeEach(() => {
    clearAuthToken();
  });

  it('应支持访问忘记密码页面', async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push('/auth/forgot-password');
    await router.isReady();
    expect(router.currentRoute.value.fullPath).toBe('/auth/forgot-password');
  });

  it('登录后可访问计划概览页', async () => {
    setAuthToken('token_123');
    const router = createAppRouter(createMemoryHistory());
    await router.push('/plans');
    await router.isReady();
    expect(router.currentRoute.value.fullPath).toBe('/plans');
  });

  it('概览和忘记密码页面应渲染标题', async () => {
    const router = createAppRouter(createMemoryHistory());
    const forgot = mount(ForgotPasswordPage, {
      global: { plugins: [router] },
    });
    const overview = mount(PlanOverviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();
    expect(forgot.text()).toContain('重置您的密码');
    expect(overview.text()).toContain('我的计划');
  });
});
