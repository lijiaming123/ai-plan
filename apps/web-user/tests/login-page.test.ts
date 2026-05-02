import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
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
  const verifyOtpMock = vi.fn();

  beforeEach(() => {
    clearAuthToken();
    verifyOtpMock.mockReset();
    trackEventMock.mockReset();
    trackPageViewMock.mockReset();
    verifyOtpMock.mockResolvedValue({
      token: 'token_telemetry',
      phone: '13800138000',
      userId: 'u1',
    });
    setApiClient({
      ...createApiClient(),
      verifyOtp: verifyOtpMock,
    });
  });

  it('登录成功后应发送 auth_login 埋点（OTP）', async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push('/auth/login');
    await router.isReady();

    const wrapper = mount(LoginPage, {
      global: { plugins: [router] },
    });

    await wrapper.get('input[aria-label="手机号"]').setValue('13800138000');
    await nextTick();
    await wrapper.get('input[aria-label="验证码"]').setValue('123456');
    await nextTick();
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    await router.isReady();

    expect(verifyOtpMock).toHaveBeenCalledWith({
      phone: '13800138000',
      code: '123456',
      purpose: 'login',
    });
    expect(trackEventMock).toHaveBeenCalledWith('auth_login', {
      properties: {
        method: 'otp',
        purpose: 'login',
      },
    });
    expect(router.currentRoute.value.path).toBe('/plans');
  });
});
