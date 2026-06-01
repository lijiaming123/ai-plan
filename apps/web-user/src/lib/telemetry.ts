import tracker from '@lijiaming816/tracksmith';
import { getApiBaseURL } from './api-client';
import { authState } from '../stores/auth';

export type FrontendTelemetryEventName =
  | 'auth_login'
  | 'auth_otp_send'
  | 'plan_create'
  | 'plan_publish'
  | 'checkin_submit'
  | 'page_view'
  | 'notification_open'
  | 'draft_regenerate'
  | 'template_publish'
  | 'template_detail_click'
  | 'template_detail_open'
  | 'template_use';

type TrackEventOptions = {
  page?: string;
  properties?: Record<string, unknown>;
};

const TRACKER_APP_ID = 'ai-plan-web-user';
const TRACKER_SOURCE = 'web-user';
const TRACKER_PLATFORM = 'web';
const SESSION_STORAGE_KEY = 'ai-plan:telemetry-session-id';

let telemetryInitialized = false;

function getClientVersion() {
  return (import.meta.env.VITE_APP_VERSION as string | undefined) || 'dev';
}

function getTracksmithReportUrl() {
  const base = getApiBaseURL();
  return `${base}/telemetry/tracksmith`;
}

function ensureSessionId() {
  if (typeof window === 'undefined') return 'ssr-session';
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const created =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `session-${Date.now()}`;
    sessionStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return `session-${Date.now()}`;
  }
}

function ensureTelemetry() {
  if (telemetryInitialized || typeof window === 'undefined') return;
  tracker.init({
    appId: TRACKER_APP_ID,
    reportUrl: getTracksmithReportUrl(),
    debug: import.meta.env.DEV && import.meta.env.VITE_TELEMETRY_DEBUG === '1',
  });
  telemetryInitialized = true;
}

export function trackEvent(
  name: FrontendTelemetryEventName,
  options: TrackEventOptions = {},
) {
  if (typeof window === 'undefined') return;
  if (!authState.token) return;

  ensureTelemetry();

  const page = options.page ?? window.location.pathname;
  tracker.track(name, {
    token: authState.token,
    timestamp: new Date().toISOString(),
    sessionId: ensureSessionId(),
    page,
    url: window.location.href,
    source: TRACKER_SOURCE,
    platform: TRACKER_PLATFORM,
    clientVersion: getClientVersion(),
    properties: options.properties,
  });
}

export function trackPageView(route: string) {
  trackEvent('page_view', {
    page: route,
    properties: {
      route,
    },
  });
}
