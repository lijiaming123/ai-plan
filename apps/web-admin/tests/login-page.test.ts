import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import LoginPage from '../src/features/auth/LoginPage.vue';
import { createAdminRouter } from '../src/router';
import { adminAuthState, clearAdminToken } from '../src/stores/auth';
import { setAdminApiClient } from '../src/lib/api-client';

describe('LoginPage', () => {
  beforeEach(() => {
    clearAdminToken();
    setAdminApiClient({
      login: vi.fn().mockResolvedValue({ token: 't1' }),
      registerAdmin: vi.fn(),
      getAdminMe: vi.fn().mockResolvedValue({
        userId: 'a1',
        email: 'admin@test.dev',
        role: 'admin',
        permissions: ['analytics:read'],
      }),
      getDashboard: vi.fn(),
      getRules: vi.fn(),
      getSubmissions: vi.fn(),
      getFunnel: vi.fn(),
      getRetention: vi.fn(),
      getPath: vi.fn(),
      getUsers: vi.fn(),
      getUser: vi.fn(),
    });
  });

  it('登录成功应写入 token 并跳转总览', async () => {
    const router = createAdminRouter(createMemoryHistory());
    await router.push('/admin/login');
    await router.isReady();

    const wrapper = mount(LoginPage, {
      global: { plugins: [router] },
    });

    await wrapper.get('#login-email').setValue('admin@test.dev');
    await wrapper.get('#login-password').setValue('secretpass');
    await wrapper.get('form').trigger('submit.prevent');

    await flushPromises();

    expect(adminAuthState.token).toBe('t1');
    expect(router.currentRoute.value.path).toBe('/admin/dashboard');
  });
});
