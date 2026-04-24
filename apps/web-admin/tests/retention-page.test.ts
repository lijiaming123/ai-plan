import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import RetentionPage from '../src/features/analytics/RetentionPage.vue';
import { createAdminRouter } from '../src/router';
import { setAdminToken, clearAdminToken } from '../src/stores/auth';
import { setAdminApiClient } from '../src/lib/api-client';

describe('RetentionPage', () => {
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
      getPath: vi.fn(),
      getUsers: vi.fn(),
      getUser: vi.fn(),
      getRetention: vi.fn().mockResolvedValue({
        cohortStart: '2026-04-01T00:00:00.000Z',
        cohortEnd: '2026-04-07T23:59:59.999Z',
        offsets: [1, 7],
        rows: [
          {
            cohortDay: '2026-04-01',
            cohortSize: 100,
            retained: {
              '1': { count: 40, rate: 0.4 },
              '7': { count: 20, rate: 0.2 },
            },
          },
        ],
      }),
    });
  });

  it('应展示 cohort 矩阵与趋势', async () => {
    setAdminToken('admin-token');
    const router = createAdminRouter(createMemoryHistory());
    await router.push('/admin/analytics/retention');
    await router.isReady();

    const wrapper = mount(RetentionPage, {
      global: { plugins: [router] },
    });

    await flushPromises();

    expect(wrapper.text()).toContain('2026-04-01');
    expect(wrapper.text()).toContain('100');
    expect(wrapper.text()).toContain('40.0%');
    expect(wrapper.text()).toContain('20.0%');
    expect(wrapper.text()).toContain('D+1');
    expect(wrapper.text()).toContain('D+7');
  });
});
