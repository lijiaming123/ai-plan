import { beforeEach, describe, expect, it, vi } from 'vitest';
const { trackEventMock, trackPageViewMock } = vi.hoisted(() => ({
  trackEventMock: vi.fn(),
  trackPageViewMock: vi.fn(),
}));

vi.mock('../src/lib/telemetry', () => ({
  trackEvent: trackEventMock,
  trackPageView: trackPageViewMock,
}));

import { createMemoryHistory } from 'vue-router';
import { createAppRouter } from '../src/router';
import { clearAuthToken, setAuthToken } from '../src/stores/auth';

describe('router telemetry', () => {
  beforeEach(() => {
    clearAuthToken();
    setAuthToken('token_123');
    trackEventMock.mockReset();
    trackPageViewMock.mockReset();
  });

  it('进入高价值页面时应发送 page_view 埋点', async () => {
    const router = createAppRouter(createMemoryHistory());

    await router.push('/notifications');
    await router.isReady();

    expect(trackPageViewMock).toHaveBeenCalledWith('/notifications');
  });
});
