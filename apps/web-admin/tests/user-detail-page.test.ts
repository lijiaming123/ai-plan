import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import UserDetailPage from '../src/features/users/UserDetailPage.vue';
import { createAdminRouter } from '../src/router';
import { setAdminToken, clearAdminToken } from '../src/stores/auth';
import { setAdminApiClient } from '../src/lib/api-client';

describe('UserDetailPage', () => {
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
      getPath: vi.fn(),
      getUsers: vi.fn(),
      getUser: vi.fn().mockResolvedValue({
        userId: 'user_alpha',
        planCount: 2,
        checkinSubmissionCount: 5,
        taskSubmissionCount: 1,
        telemetryEventCount: 10,
        registeredAtApprox: '2026-01-01T00:00:00.000Z',
        firstActivityAt: '2026-01-01T00:00:00.000Z',
        lastActivityAt: '2026-02-01T00:00:00.000Z',
        telemetryTopEvents: [
          { eventName: 'dashboard_view', count: 4 },
          { eventName: 'checkin_submit', count: 3 },
        ],
      }),
    });
  });

  it('应渲染关键计数与 Telemetry Top', async () => {
    setAdminToken('admin-token');
    const router = createAdminRouter(createMemoryHistory());
    await router.push('/admin/users/user_alpha');
    await router.isReady();

    const wrapper = mount(UserDetailPage, {
      global: { plugins: [router] },
    });

    await flushPromises();

    expect(wrapper.text()).toContain('user_alpha');
    expect(wrapper.text()).toContain('计划数');
    expect(wrapper.text()).toContain('2');
    expect(wrapper.text()).toContain('5');
    expect(wrapper.text()).toContain('dashboard_view');
    expect(wrapper.text()).toContain('4');
  });

  it('404 时应展示未找到提示', async () => {
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
      getPath: vi.fn(),
      getUsers: vi.fn(),
      getUser: vi.fn().mockRejectedValue(new Error('Request failed: 404')),
    });

    const router = createAdminRouter(createMemoryHistory());
    await router.push('/admin/users/missing');
    await router.isReady();

    const wrapper = mount(UserDetailPage, {
      global: { plugins: [router] },
    });

    await flushPromises();

    expect(wrapper.text()).toContain('未找到');
  });
});
