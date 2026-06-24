import { describe, expect, it } from 'vitest';
import {
  addDaysYmd,
  addMonthsYmd,
  calcDurationDays,
  computeDeadlineByCycle,
  formatDetailDeadline,
  formatYmd,
  todayKeyLocal,
  toLocalDateOnly,
} from '../src/lib/plan-dates';
import { planStatusLabel, planTypeLabel } from '../src/lib/plan-labels';
import { isAllowedCheckinFile, mergeCheckinAttachments, normalizeHttpsUrl } from '../src/lib/checkin-attachments';

describe('plan-dates', () => {
  it('formatYmd / addDays / addMonths', () => {
    expect(formatYmd(new Date('2026-06-01T12:00:00'))).toBe('2026-06-01');
    expect(addDaysYmd('2026-06-01', 7)).toBe('2026-06-08');
    expect(addMonthsYmd('2026-01-15', 1)).toBe('2026-02-15');
  });

  it('computeDeadlineByCycle', () => {
    expect(computeDeadlineByCycle('2026-06-01', '1w')).toBe('2026-06-08');
    expect(computeDeadlineByCycle('2026-06-01', 'custom')).toBe('');
  });

  it('calcDurationDays', () => {
    expect(calcDurationDays('2026-06-01', '2026-06-01')).toBe(1);
    expect(calcDurationDays('2026-06-01', '2026-06-03')).toBe(3);
  });

  it('toLocalDateOnly / todayKeyLocal', () => {
    expect(toLocalDateOnly('2026-06-15')).toBeInstanceOf(Date);
    expect(todayKeyLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('formatDetailDeadline', () => {
    const s = formatDetailDeadline('2026-06-15T00:00:00.000Z');
    expect(s).toContain('2026');
  });
});

describe('plan-labels', () => {
  it('planTypeLabel', () => {
    expect(planTypeLabel('study')).toBe('学习');
    expect(planTypeLabel('travel')).toBe('旅游');
  });

  it('planStatusLabel', () => {
    expect(planStatusLabel({ status: 'active' })).toBe('执行中');
    expect(planStatusLabel({ isArchived: true })).toBe('已归档');
    expect(planStatusLabel({ isCompleted: true })).toBe('已完成');
  });
});

describe('checkin-attachments', () => {
  it('normalizeHttpsUrl', () => {
    expect(normalizeHttpsUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(normalizeHttpsUrl('http://example.com')).toBeNull();
  });

  it('isAllowedCheckinFile', () => {
    expect(isAllowedCheckinFile(new File(['x'], 'a.pdf', { type: 'application/pdf' }))).toBe(true);
    expect(isAllowedCheckinFile(new File(['x'], 'a.exe', { type: 'application/octet-stream' }))).toBe(false);
  });

  it('mergeCheckinAttachments dedupes', () => {
    const merged = mergeCheckinAttachments({
      uploaded: [{ url: 'https://a.com/1', fileName: 'a' }],
      manualLinks: [{ url: 'https://a.com/1', fileName: 'b' }],
    });
    expect(merged).toHaveLength(1);
  });
});
