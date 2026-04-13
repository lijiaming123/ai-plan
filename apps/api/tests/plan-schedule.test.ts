import { describe, expect, it } from 'vitest';
import { buildScheduleSlotKeys, decideScheduleGranularity } from '../src/modules/plans/plan.service';

describe('plan schedule rules', () => {
  it('deep => day', () => {
    expect(
      decideScheduleGranularity({ mode: 'deep', startDate: '2026-04-01', endDate: '2026-04-30' })
    ).toBe('day');
  });

  it('rough => week', () => {
    expect(
      decideScheduleGranularity({ mode: 'rough', startDate: '2026-04-01', endDate: '2026-04-30' })
    ).toBe('week');
  });

  it('smart: <= 92 days => day', () => {
    expect(
      decideScheduleGranularity({ mode: 'smart', startDate: '2026-04-01', endDate: '2026-06-30' })
    ).toBe('day');
  });

  it('smart: > 92 days => week', () => {
    expect(
      decideScheduleGranularity({ mode: 'smart', startDate: '2026-01-01', endDate: '2026-06-30' })
    ).toBe('week');
  });

  it('build day slot keys inclusive', () => {
    expect(
      buildScheduleSlotKeys({ granularity: 'day', startDate: '2026-04-01', endDate: '2026-04-03' })
    ).toEqual(['2026-04-01', '2026-04-02', '2026-04-03']);
  });

  it('build week slot keys by duration', () => {
    expect(
      buildScheduleSlotKeys({ granularity: 'week', startDate: '2026-04-01', endDate: '2026-04-30' })
    ).toEqual(['W1', 'W2', 'W3', 'W4', 'W5']);
  });
});

