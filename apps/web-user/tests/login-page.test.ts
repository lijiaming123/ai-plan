import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
const { trackEventMock, trackPageViewMock } = vi.hoisted(() => ({
  trackEventMock: vi.fn(),
  trackPageViewMock: vi.fn(),
}));

vi.mock('../src/lib/telemetry', () => ({
  trackEvent: trackEventMock,
  trackPageView: trackPageViewMock,
}));

import LoginPage from '../src/features/auth/LoginPage.vue';
import { createAppRouter } from '../src/router';
import { clearAuthToken } from '../src/stores/auth';
import { createApiClient, setApiClient } from '../src/lib/api-client';

describe('LoginPage telemetry', () => {
  const loginMock = vi.fn();

  beforeEach(() => {
    clearAuthToken();
    loginMock.mockReset();
    trackEventMock.mockReset();
    trackPageViewMock.mockReset();
    loginMock.mockResolvedValue({ token: 'token_telemetry' });
    setApiClient({
      ...createApiClient(),
      login: loginMock,
    });
  });

  it('登录成功后应发送 auth_login 埋点', async () => {
    const router = createAppRouter(createMemoryHistory());
    const push = vi.spyOn(router, 'push');
    await router.push('/auth/login');
    await router.isReady();

    const wrapper = mount(LoginPage, {
      global: { plugins: [router] },
    });

    await wrapper.get('input[aria-label="邮箱"]').setValue('demo@ai-plan.dev');
    await wrapper.get('input[aria-label="密码"]').setValue('Pass1234!');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(loginMock).toHaveBeenCalledWith({
      email: 'demo@ai-plan.dev',
      password: 'Pass1234!',
      confirmPassword: '',
      useProTier: false,
    });
    expect(trackEventMock).toHaveBeenCalledWith('auth_login', {
      properties: {
        method: 'password',
      },
    });
    expect(push).toHaveBeenCalledWith('/plans');
  });
});
