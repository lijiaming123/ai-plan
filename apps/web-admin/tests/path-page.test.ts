import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import PathPage from '../src/features/analytics/PathPage.vue';
import { createAdminRouter } from '../src/router';
import { setAdminToken, clearAdminToken } from '../src/stores/auth';
import { setAdminApiClient } from '../src/lib/api-client';

describe('PathPage', () => {
  beforeEach(() => {
    clearAdminToken();
    setAdminApiClient({
      login: vi.fn(),
      registerAdmin: vi.fn(),
      getAdminMe: vi.fn(),
      getDashboard: vi.fn(),
      getRules: vi.fn(),
      getSubmissions: vi.fn(),
      getFunnel: vi.fn(),
      getRetention: vi.fn(),
      getUsers: vi.fn(),
      getUser: vi.fn(),
      getPath: vi.fn().mockResolvedValue({
        start: '2026-04-01T00:00:00.000Z',
        end: '2026-04-07T23:59:59.999Z',
        startEvent: 'dashboard_view',
        pathLength: 3,
        sessionGapMinutes: 30,
        streamCount: 5,
        totalPaths: 2,
        paths: [
          { path: 'dashboard_view->plan_create->checkin_submit', count: 3, share: 0.6 },
          { path: 'dashboard_view->plan_create->plan_publish', count: 2, share: 0.4 },
        ],
      }),
    });
  });

  it('应展示 Top paths 表格', async () => {
    setAdminToken('admin-token');
    const router = createAdminRouter(createMemoryHistory());
    await router.push('/admin/analytics/path');
    await router.isReady();

    const wrapper = mount(PathPage, {
      global: { plugins: [router] },
    });

    await flushPromises();

    expect(wrapper.text()).toContain('dashboard_view->plan_create->checkin_submit');
    expect(wrapper.text()).toContain('60.0%');
    expect(wrapper.text()).toContain('会话数 5');
  });

  it('无路径时应展示说明文案', async () => {
    setAdminToken('admin-token');
    setAdminApiClient({
      login: vi.fn(),
      registerAdmin: vi.fn(),
      getAdminMe: vi.fn(),
      getDashboard: vi.fn(),
      getRules: vi.fn(),
      getSubmissions: vi.fn(),
      getFunnel: vi.fn(),
      getRetention: vi.fn(),
      getUsers: vi.fn(),
      getUser: vi.fn(),
      getPath: vi.fn().mockResolvedValue({
        start: '2026-04-01T00:00:00.000Z',
        end: '2026-04-07T23:59:59.999Z',
        startEvent: 'dashboard_view',
        pathLength: 4,
        sessionGapMinutes: 30,
        streamCount: 0,
        totalPaths: 0,
        paths: [],
      }),
    });

    const router = createAdminRouter(createMemoryHistory());
    await router.push('/admin/analytics/path');
    await router.isReady();

    const wrapper = mount(PathPage, {
      global: { plugins: [router] },
    });

    await flushPromises();

    expect(wrapper.text()).toContain('没有可统计的完整路径');
  });
});
