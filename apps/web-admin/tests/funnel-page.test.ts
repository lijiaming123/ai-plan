import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import FunnelPage from '../src/features/analytics/FunnelPage.vue';
import { createAdminRouter } from '../src/router';
import { setAdminToken, clearAdminToken } from '../src/stores/auth';
import { setAdminApiClient } from '../src/lib/api-client';

describe('FunnelPage', () => {
  beforeEach(() => {
    clearAdminToken();
    setAdminApiClient({
      login: vi.fn(),
      registerAdmin: vi.fn(),
      getAdminMe: vi.fn(),
      getDashboard: vi.fn(),
      getRules: vi.fn(),
      getSubmissions: vi.fn(),
      getRetention: vi.fn(),
      getPath: vi.fn(),
      getUsers: vi.fn(),
      getUser: vi.fn(),
      getFunnel: vi.fn().mockResolvedValue({
        template: 'registration_to_checkin',
        windowDays: 7,
        start: '2026-04-01T00:00:00.000Z',
        end: '2026-04-30T23:59:59.999Z',
        steps: [
          { step: 'auth_register', count: 10, conversionFromPrev: null },
          { step: 'plan_create', count: 5, conversionFromPrev: 0.5 },
        ],
      }),
    });
  });

  it('应展示漏斗步骤表格', async () => {
    setAdminToken('admin-token');
    const router = createAdminRouter(createMemoryHistory());
    await router.push('/admin/analytics/funnel');
    await router.isReady();

    const wrapper = mount(FunnelPage, {
      global: { plugins: [router] },
    });

    await flushPromises();

    expect(wrapper.text()).toContain('auth_register');
    expect(wrapper.text()).toContain('plan_create');
    expect(wrapper.text()).toContain('50.0%');
  });
});
