import { describe, expect, it } from 'vitest';
import { validateAndSanitizeTelemetryEvent } from '../src/modules/telemetry/telemetry-event-dictionary';

describe('telemetry event dictionary v1', () => {
  it('unknown event should be rejected', () => {
    const res = validateAndSanitizeTelemetryEvent({
      name: 'unknown_event',
      time: new Date().toISOString(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('INVALID_EVENT');
    }
  });

  it('invalid time should be rejected', () => {
    const res = validateAndSanitizeTelemetryEvent({
      name: 'auth_login',
      time: 'not-a-time',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('INVALID_TIME');
    }
  });

  it('should drop forbidden keys and non-allowlisted properties', () => {
    const res = validateAndSanitizeTelemetryEvent({
      name: 'plan_publish',
      time: '2026-04-22T00:00:00.000Z',
      properties: {
        planId: 'p1',
        email: 'x@y.com',
        password: 'secret',
        extra: 'nope',
      },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.droppedForbiddenKeys).toEqual(['email', 'password']);
      expect(res.sanitized.properties).toEqual({ planId: 'p1' });
    }
  });

  it('should accept newly added high-value frontend events', () => {
    const res = validateAndSanitizeTelemetryEvent({
      name: 'notification_open',
      time: '2026-04-22T00:00:00.000Z',
      page: '/notifications',
      properties: {
        notificationId: 'n1',
        type: 'checkin_overdue_day',
        extra: 'drop-me',
      },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.sanitized.properties).toEqual({
        notificationId: 'n1',
        type: 'checkin_overdue_day',
      });
    }
  });

  it('template_detail_open should be accepted and allowlist versionId', () => {
    const res = validateAndSanitizeTelemetryEvent({
      name: 'template_detail_open',
      time: '2026-05-09T00:00:00.000Z',
      page: '/templates/market/m1',
      properties: {
        templateId: 'm1',
        versionId: 'v1',
        // should be dropped
        planId: 'p_should_drop',
        extra: 'drop-me',
      },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.sanitized.properties).toEqual({
        templateId: 'm1',
        versionId: 'v1',
      });
    }
  });

  it('template_use should allow versionId as well', () => {
    const res = validateAndSanitizeTelemetryEvent({
      name: 'template_use',
      time: '2026-05-09T00:00:00.000Z',
      properties: {
        templateId: 'm1',
        templateSource: 'market',
        planId: 'p1',
        versionId: 'v1',
      },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.sanitized.properties).toEqual({
        templateId: 'm1',
        templateSource: 'market',
        planId: 'p1',
        versionId: 'v1',
      });
    }
  });

  it('template_detail_click should be accepted and allowlist from', () => {
    const res = validateAndSanitizeTelemetryEvent({
      name: 'template_detail_click',
      time: '2026-05-09T00:00:00.000Z',
      page: '/templates',
      properties: {
        templateId: 'm1',
        from: 'market_list',
        // should be dropped
        versionId: 'v_should_drop',
        extra: 'drop-me',
      },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.sanitized.properties).toEqual({
        templateId: 'm1',
        from: 'market_list',
      });
    }
  });
});

