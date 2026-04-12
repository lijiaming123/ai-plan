import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { createAppRouter } from '../src/router';
import { clearAuthToken, setAuthToken } from '../src/stores/auth';

describe('UserShellLayout 路由', () => {
  beforeEach(() => {
    clearAuthToken();
    setAuthToken('token_shell');
  });

  it('侧栏相关路由应解析到具名路由', async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push('/dashboard');
    await router.isReady();
    expect(router.currentRoute.value.name).toBe('dashboard');

    await router.push('/templates');
    expect(router.currentRoute.value.name).toBe('templates');

    await router.push('/archive');
    expect(router.currentRoute.value.name).toBe('archive');

    await router.push('/insights');
    expect(router.currentRoute.value.name).toBe('insights');

    await router.push('/notifications');
    expect(router.currentRoute.value.name).toBe('notifications');

    await router.push('/help');
    expect(router.currentRoute.value.name).toBe('help');

    await router.push('/settings');
    expect(router.currentRoute.value.name).toBe('settings');
  });

  it('创建计划页不应嵌套在 UserShellLayout 下', async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push('/plans/new');
    await router.isReady();
    expect(router.currentRoute.value.name).toBe('plan-create');
    expect(router.currentRoute.value.matched).toHaveLength(1);
  });

  it('计划列表与详情应经过 Shell（matched 含根布局）', async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push('/plans');
    await router.isReady();
    expect(router.currentRoute.value.matched.length).toBeGreaterThanOrEqual(2);

    await router.push('/plans/plan_1');
    expect(router.currentRoute.value.name).toBe('plan-detail');
    expect(router.currentRoute.value.matched.length).toBeGreaterThanOrEqual(2);
  });
});
