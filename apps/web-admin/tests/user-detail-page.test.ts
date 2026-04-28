import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import UserDetailPage from '../src/features/users/UserDetailPage.vue';
import { createAdminRouter } from '../src/router';
import { setAdminToken, clearAdminToken } from '../src/stores/auth';
import { setAdminApiClient } from '../src/lib/api-client';

function createUsersMe() {
  return {
    userId: 'admin_1',
    email: 'admin@test.dev',
    role: 'admin' as const,
    permissions: ['users:read'],
  };
}

describe('UserDetailPage', () => {
  beforeEach(() => {
    clearAdminToken();
    setAdminApiClient({
      login: vi.fn(),
      registerAdmin: vi.fn(),
      getAdminMe: vi.fn().mockResolvedValue(createUsersMe()),
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

  it('renders summary cards and telemetry top events', async () => {
    setAdminToken('admin-token');
    const router = createAdminRouter(createMemoryHistory());
    await router.push('/admin/users/user_alpha');
    await router.isReady();

    const wrapper = mount(UserDetailPage, {
      global: { plugins: [router] },
    });

    await flushPromises();

    expect(wrapper.text()).toContain('user_alpha');
    expect(wrapper.text()).toContain('用户画像');
    expect(wrapper.text()).toContain('dashboard_view');
    expect(wrapper.text()).toContain('Telemetry Top Events');
  });

  it('shows not found state on 404', async () => {
    setAdminToken('admin-token');
    setAdminApiClient({
      login: vi.fn(),
      registerAdmin: vi.fn(),
      getAdminMe: vi.fn().mockResolvedValue(createUsersMe()),
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

    expect(wrapper.text()).toContain('未找到该 userId');
  });
});
