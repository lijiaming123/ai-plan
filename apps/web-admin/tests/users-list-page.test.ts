import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import UsersListPage from '../src/features/users/UsersListPage.vue';
import { createAdminRouter } from '../src/router';
import { setAdminToken, clearAdminToken } from '../src/stores/auth';
import { setAdminApiClient } from '../src/lib/api-client';

describe('UsersListPage', () => {
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
      getUsers: vi.fn().mockResolvedValue({
        items: [{ userId: 'user_alpha' }, { userId: 'user_beta' }],
        total: 2,
        page: 1,
        pageSize: 20,
      }),
      getUser: vi.fn(),
    });
  });

  it('应展示用户 id 与详情链接', async () => {
    setAdminToken('admin-token');
    const router = createAdminRouter(createMemoryHistory());
    await router.push('/admin/users');
    await router.isReady();

    const wrapper = mount(UsersListPage, {
      global: { plugins: [router] },
    });

    await flushPromises();

    expect(wrapper.text()).toContain('user_alpha');
    expect(wrapper.text()).toContain('user_beta');
    const html = wrapper.html();
    expect(html).toContain('/admin/users/user_alpha');
  });
});
