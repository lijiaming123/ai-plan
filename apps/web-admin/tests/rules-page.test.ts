import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import RulesPage from '../src/features/rules/RulesPage.vue';
import { createAdminRouter } from '../src/router';
import { setAdminToken, clearAdminToken } from '../src/stores/auth';
import { setAdminApiClient } from '../src/lib/api-client';

describe('RulesPage', () => {
  beforeEach(() => {
    clearAdminToken();
    setAdminApiClient({
      login: vi.fn(),
      getDashboard: vi.fn(),
      getRules: vi.fn().mockResolvedValue([
        { id: 'r1', key: 'minEvidenceCount', value: '1', description: '最少证据数' },
      ]),
      getSubmissions: vi.fn(),
    });
  });

  it('应展示规则配置列表', async () => {
    setAdminToken('admin-token');
    const router = createAdminRouter(createMemoryHistory());
    await router.push('/admin/rules');
    await router.isReady();

    const wrapper = mount(RulesPage, {
      global: { plugins: [router] },
    });

    await flushPromises();

    expect(wrapper.text()).toContain('minEvidenceCount');
  });
});
