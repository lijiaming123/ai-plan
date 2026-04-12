import { describe, expect, it, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import { createAppRouter } from '../src/router';
import SettingsPage from '../src/features/settings/SettingsPage.vue';
import { createApiClient, getApiClient, setApiClient } from '../src/lib/api-client';
import { clearAuthToken, setAuthToken, setUserEmail } from '../src/stores/auth';
import {
  resetUserPreferencesForTests,
  USER_PREFS_STORAGE_KEY,
  userPreferences,
} from '../src/stores/user-preferences';

function demoJwt() {
  const payload = Buffer.from(JSON.stringify({ sub: 'user_demo', role: 'user' })).toString('base64');
  return `h.${payload}.s`;
}

describe('SettingsPage 用户中心', () => {
  beforeEach(() => {
    clearAuthToken();
    resetUserPreferencesForTests();
    localStorage.removeItem('ai-plan-display-name');
    const noopFetch = vi.fn(() => Promise.reject(new Error('unexpected fetch'))) as unknown as typeof fetch;
    const base = createApiClient({ baseURL: 'http://test.local', fetchImpl: noopFetch });
    setApiClient({
      ...base,
      getAuthMe: vi.fn().mockResolvedValue({
        userId: 'user_demo',
        email: 'a@b.c',
        role: 'user' as const,
      }),
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

    await wrapper.get('[data-testid="settings-upgrade-demo"]').trigger('click');
    expect(wrapper.find('[data-testid="settings-upgrade-demo"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('已是专业版');
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
