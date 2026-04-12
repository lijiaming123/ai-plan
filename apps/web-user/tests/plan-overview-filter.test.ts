import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import { createAppRouter } from '../src/router';
import PlanOverviewPage from '../src/features/plans/PlanOverviewPage.vue';
import { clearAuthToken, setAuthToken } from '../src/stores/auth';
import { planListSearchQuery } from '../src/stores/plan-search-query';

describe('PlanOverviewPage filter', () => {
  it('应根据状态筛选计划卡片', async () => {
    clearAuthToken();
    planListSearchQuery.value = '';
    setAuthToken('token_123');
    const router = createAppRouter(createMemoryHistory());
    await router.push('/plans');
    await router.isReady();

    const wrapper = mount(PlanOverviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(5);

    await wrapper.get('[data-testid="filter-进行中"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(2);

    await wrapper.get('[data-testid="filter-已完成"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(1);

    await wrapper.get('[data-testid="filter-未开始"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(2);
  });

  it('应与URL查询参数同步筛选状态', async () => {
    clearAuthToken();
    planListSearchQuery.value = '';
    setAuthToken('token_123');
    const router = createAppRouter(createMemoryHistory());
    await router.push('/plans?status=已完成');
    await router.isReady();

    const wrapper = mount(PlanOverviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(1);

    await wrapper.get('[data-testid="filter-进行中"]').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.query.status).toBe('进行中');
    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(2);
  });

  it('应根据顶栏搜索关键字筛选计划卡片', async () => {
    clearAuthToken();
    planListSearchQuery.value = '';
    setAuthToken('token_123');
    const router = createAppRouter(createMemoryHistory());
    await router.push('/plans');
    await router.isReady();

    const wrapper = mount(PlanOverviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();
    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(5);

    planListSearchQuery.value = '健身';
    await flushPromises();
    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(1);

    planListSearchQuery.value = '';
    await flushPromises();
    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(5);
  });
});
