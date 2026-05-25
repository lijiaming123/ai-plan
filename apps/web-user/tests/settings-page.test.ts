import { describe, expect, it, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import { createAppRouter } from '../src/router';
import SettingsPage from '../src/features/settings/SettingsPage.vue';
import { createApiClient, getApiClient, setApiClient } from '../src/lib/api-client';
import { clearAuthToken, setAuthToken, setUserEmail, authState } from '../src/stores/auth';
import { resetDisplayProfileForTests } from '../src/stores/display-profile';
import {
  resetUserPreferencesForTests,
  USER_PREFS_STORAGE_KEY,
  userPreferences,
} from '../src/stores/user-preferences';

function demoJwt() {
  const payload = Buffer.from(JSON.stringify({ sub: 'user_demo', role: 'user' })).toString('base64');
  return `h.${payload}.s`;
}

const meBasic = {
  userId: 'user_demo',
  email: 'a@b.c',
  role: 'user' as const,
  planTier: 'basic' as const,
  proTrialUsed: false,
  subscriptionSource: 'none' as const,
  billingCycle: 'monthly' as const,
  priceCents: 1900,
  proExpiresAt: null,
  aiQuota: { used: 0, limit: 30, yearMonth: '2026-05' },
};

describe('SettingsPage 用户中心', () => {
  beforeEach(() => {
    clearAuthToken();
    resetUserPreferencesForTests();
    resetDisplayProfileForTests();
    const noopFetch = vi.fn(() => Promise.reject(new Error('unexpected fetch'))) as unknown as typeof fetch;
    const base = createApiClient({ baseURL: 'http://test.local', fetchImpl: noopFetch });
    setApiClient({
      ...base,
      getAuthMe: vi.fn().mockResolvedValue(meBasic),
      startProTrial: vi.fn().mockResolvedValue({
        ...meBasic,
        planTier: 'pro' as const,
        proTrialUsed: true,
        subscriptionSource: 'trial' as const,
        proExpiresAt: '2026-05-15T23:59:59.999Z',
      }),
      getPlanAssistantContext: vi.fn().mockRejectedValue({ status: 404 }),
    });
  });

  it('应展示退出登录，并在登录态调用 getAuthMe', async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push('/settings');
    await router.isReady();

    setAuthToken(demoJwt());
    setUserEmail('legacy@local.test');

    const wrapper = mount(SettingsPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('[data-testid="settings-logout"]').exists()).toBe(true);
    expect(getApiClient().getAuthMe).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="settings-start-trial"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-upgrade-demo"]').exists()).toBe(false);
  });

  it('开始试用应调用 startProTrial 并更新档位', async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push('/settings');
    await router.isReady();

    setAuthToken(demoJwt());
    setUserEmail('u@test.dev');

    const wrapper = mount(SettingsPage, { global: { plugins: [router] } });
    await flushPromises();

    await wrapper.get('[data-testid="settings-start-trial"]').trigger('click');
    await flushPromises();

    expect(getApiClient().startProTrial).toHaveBeenCalled();
    expect(authState.tier).toBe('pro');
    expect(authState.proTrialUsed).toBe(true);
    expect(wrapper.find('[data-testid="settings-start-trial"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-renew-pro"]').exists()).toBe(true);
  });

  it('已用过试用应展示续费而非试用按钮', async () => {
    vi.mocked(getApiClient().getAuthMe).mockResolvedValue({
      ...meBasic,
      proTrialUsed: true,
    });

    const router = createAppRouter(createMemoryHistory());
    await router.push('/settings');
    await router.isReady();
    setAuthToken(demoJwt());

    const wrapper = mount(SettingsPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('[data-testid="settings-start-trial"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-renew-pro"]').exists()).toBe(true);
  });

  it('切换计划截止通知应写入 localStorage', async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push('/settings');
    await router.isReady();

    setAuthToken(demoJwt());
    setUserEmail('u@test.dev');

    const wrapper = mount(SettingsPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(userPreferences.notifications.planDeadline).toBe(true);

    await wrapper.get('[data-testid="settings-notify-deadline"]').trigger('click');

    expect(userPreferences.notifications.planDeadline).toBe(false);
    const raw = localStorage.getItem(USER_PREFS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(raw).toContain('"planDeadline":false');
  });
});
