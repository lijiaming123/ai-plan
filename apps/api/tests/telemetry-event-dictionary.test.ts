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
});

