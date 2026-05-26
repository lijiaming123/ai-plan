import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import UserDetailPage from '../src/features/users/UserDetailPage.vue';
import { createAdminRouter } from '../src/router';
import { setAdminToken, clearAdminToken, adminProfile } from '../src/stores/auth';
import { setAdminApiClient } from '../src/lib/api-client';

function createUsersMe() {
  return {
    userId: 'admin_1',
    email: 'admin@test.dev',
    role: 'admin' as const,
    permissions: ['users:read', 'users:write'],
  };
}

const sampleUser = {
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
  phone: '13800138000',
  planTier: 'basic',
  proExpiresAt: null,
  proTrialUsed: false,
  proSubscriptionSource: null,
};

describe('UserDetailPage', () => {
  beforeEach(() => {
    clearAdminToken();
    adminProfile.permissions = ['users:read', 'users:write'];
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
      getUser: vi.fn().mockResolvedValue(sampleUser),
      renewProMonth: vi.fn().mockResolvedValue({
        ok: true,
        planTier: 'pro',
        proExpiresAt: '2026-06-09T23:59:59.999Z',
        proSubscriptionSource: 'paid',
      }),
      getAuditLogs: vi.fn(),
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
    expect(wrapper.find('[data-testid="admin-user-membership"]').exists()).toBe(true);
  });

  it('续期按钮应调用 renewProMonth 并更新展示', async () => {
    setAdminToken('admin-token');
    const router = createAdminRouter(createMemoryHistory());
    await router.push('/admin/users/user_alpha');
    await router.isReady();

    const wrapper = mount(UserDetailPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.get('[data-testid="admin-renew-pro-month"]').trigger('click');
    await flushPromises();

    const { getAdminApiClient } = await import('../src/lib/api-client');
    expect(getAdminApiClient().renewProMonth).toHaveBeenCalledWith('admin-token', 'user_alpha');
    expect(wrapper.get('[data-testid="admin-user-tier"]').text()).toContain('专业版');
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
      renewProMonth: vi.fn(),
      getAuditLogs: vi.fn(),
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
