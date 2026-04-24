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

import NotificationsPage from '../src/features/notifications/NotificationsPage.vue';
import { createAppRouter } from '../src/router';
import { clearAuthToken, setAuthToken } from '../src/stores/auth';
import { createApiClient, setApiClient } from '../src/lib/api-client';

describe('NotificationsPage telemetry', () => {
  const listNotificationsMock = vi.fn();
  const getNotificationPreferencesMock = vi.fn();
  const patchNotificationReadMock = vi.fn();

  beforeEach(() => {
    clearAuthToken();
    setAuthToken('token_123');
    listNotificationsMock.mockReset();
    getNotificationPreferencesMock.mockReset();
    patchNotificationReadMock.mockReset();
    trackEventMock.mockReset();
    trackPageViewMock.mockReset();

    listNotificationsMock.mockResolvedValue({
      items: [
        {
          id: 'notif_1',
          userId: 'user_demo',
          type: 'checkin_overdue_day',
          planId: 'plan_1',
          slotKey: '2026-04-10',
          title: '昨日计划未提交',
          body: '请尽快补交证明',
          readAt: null,
          createdAt: '2026-04-22T10:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
    getNotificationPreferencesMock.mockResolvedValue({
      timeZone: 'Asia/Shanghai',
      remindAt: '20:00',
      pendingRemindAt: null,
      switchAt: null,
    });
    patchNotificationReadMock.mockResolvedValue({ ok: true });

    setApiClient({
      ...createApiClient(),
      listNotifications: listNotificationsMock,
      getNotificationPreferences: getNotificationPreferencesMock,
      patchNotificationRead: patchNotificationReadMock,
    });
  });

  it('打开通知后应发送 notification_open 埋点', async () => {
    const router = createAppRouter(createMemoryHistory());
    const push = vi.spyOn(router, 'push');
    await router.push('/notifications');
    await router.isReady();

    const wrapper = mount(NotificationsPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.get('[data-testid="notification-item"]').trigger('click');
    await flushPromises();

    expect(patchNotificationReadMock).toHaveBeenCalledWith({
      token: 'token_123',
      id: 'notif_1',
    });
    expect(trackEventMock).toHaveBeenCalledWith('notification_open', {
      properties: {
        notificationId: 'notif_1',
        type: 'checkin_overdue_day',
        from: 'notifications_page',
      },
    });
    expect(push).toHaveBeenCalledWith({
      path: '/plans/plan_1',
      query: { slotKey: '2026-04-10', openCheckin: '1' },
    });
  });
});
