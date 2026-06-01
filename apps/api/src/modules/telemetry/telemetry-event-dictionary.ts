export type TelemetryPlatform = 'web' | 'ios' | 'android' | 'unknown';

export type TelemetryEventName =
  | 'auth_register'
  | 'auth_login'
  | 'plan_create'
  | 'plan_publish'
  | 'dashboard_view'
  | 'checkin_submit'
  | 'page_view'
  | 'notification_open'
  | 'draft_regenerate'
  | 'template_publish'
  | 'template_detail_click'
  | 'template_detail_open'
  | 'template_use';

export type TelemetryEvent = {
  name: TelemetryEventName;
  time: string;
  sessionId?: string;
  page?: string;
  properties?: Record<string, unknown>;
};

export const TELEMETRY_FORBIDDEN_PROPERTY_KEYS = [
  'password',
  'phone',
  'mobile',
  'email',
  'idcard',
  'id_card',
  'realname',
  'name',
  'address',
] as const;

export type TelemetryValidationOk = {
  ok: true;
  sanitized: TelemetryEvent;
  droppedForbiddenKeys: string[];
};

export type TelemetryValidationErr = {
  ok: false;
  code: 'INVALID_EVENT' | 'INVALID_TIME';
  message: string;
};

const EVENT_PROPERTY_ALLOWLIST: Record<TelemetryEventName, Set<string>> = {
  auth_register: new Set(['method']),
  auth_login: new Set(['method']),
  plan_create: new Set(['planId', 'type']),
  plan_publish: new Set(['planId']),
  dashboard_view: new Set(['route']),
  checkin_submit: new Set(['planId', 'slotKey', 'variant']),
  page_view: new Set(['route']),
  notification_open: new Set(['notificationId', 'type', 'from']),
  draft_regenerate: new Set(['planId', 'version', 'mode']),
  template_publish: new Set(['planId', 'templateId', 'category']),
  template_detail_click: new Set(['templateId', 'from']),
  template_detail_open: new Set(['templateId', 'versionId']),
  template_use: new Set(['templateId', 'templateSource', 'planId', 'versionId']),
};

function normalizeKey(k: string) {
  return k.trim().toLowerCase();
}

function sanitizeProperties(
  name: TelemetryEventName,
  raw: Record<string, unknown>,
): { properties: Record<string, unknown>; droppedForbiddenKeys: string[] } {
  const allow = EVENT_PROPERTY_ALLOWLIST[name];
  const out: Record<string, unknown> = {};
  const droppedForbiddenKeys: string[] = [];

  for (const [k, v] of Object.entries(raw)) {
    const nk = normalizeKey(k);
    if ((TELEMETRY_FORBIDDEN_PROPERTY_KEYS as readonly string[]).includes(nk)) {
      droppedForbiddenKeys.push(k);
      continue;
    }
    if (!allow.has(k)) continue;
    out[k] = v;
  }

  return { properties: out, droppedForbiddenKeys };
}

export function validateAndSanitizeTelemetryEvent(
  input: unknown,
): TelemetryValidationOk | TelemetryValidationErr {
  if (!input || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_EVENT', message: 'event must be object' };
  }
  const e = input as Record<string, unknown>;
  const name = e.name;
  const time = e.time;

  if (typeof name !== 'string') {
    return { ok: false, code: 'INVALID_EVENT', message: 'name is required' };
  }
  if (!Object.prototype.hasOwnProperty.call(EVENT_PROPERTY_ALLOWLIST, name)) {
    return { ok: false, code: 'INVALID_EVENT', message: 'unknown event name' };
  }
  if (typeof time !== 'string' || !time.trim()) {
    return { ok: false, code: 'INVALID_TIME', message: 'time is required' };
  }
  const d = new Date(time);
  if (!Number.isFinite(d.getTime())) {
    return { ok: false, code: 'INVALID_TIME', message: 'time must be ISO string' };
  }

  const sessionId =
    typeof e.sessionId === 'string' && e.sessionId.trim() ? e.sessionId : undefined;
  const page = typeof e.page === 'string' && e.page.trim() ? e.page : undefined;

  const rawProps = e.properties;
  const { properties, droppedForbiddenKeys } =
    rawProps && typeof rawProps === 'object' && !Array.isArray(rawProps)
      ? sanitizeProperties(name as TelemetryEventName, rawProps as Record<string, unknown>)
      : { properties: {}, droppedForbiddenKeys: [] };

  return {
    ok: true,
    sanitized: {
      name: name as TelemetryEventName,
      time: d.toISOString(),
      sessionId,
      page,
      properties: Object.keys(properties).length ? properties : undefined,
    },
    droppedForbiddenKeys,
  };
}

