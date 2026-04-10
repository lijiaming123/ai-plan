import { describe, expect, it } from 'vitest';
import { resolveGranularityPlan } from '../src/modules/plans/granularity';

describe('plan granularity rules', () => {
  it('deep: D=6 -> day only', () => {
    const output = resolveGranularityPlan({ mode: 'deep', durationDays: 6 });
    expect(output.slots).toEqual(['day']);
    expect(output.summaries).toEqual([]);
  });

  it('deep: D=7 -> day + weekly summary', () => {
    const output = resolveGranularityPlan({ mode: 'deep', durationDays: 7 });
    expect(output.slots).toEqual(['day']);
    expect(output.summaries).toEqual(['weekly']);
  });

  it('deep: D=30 -> day + weekly + monthly summary', () => {
    const output = resolveGranularityPlan({ mode: 'deep', durationDays: 30 });
    expect(output.slots).toEqual(['day']);
    expect(output.summaries).toEqual(['weekly', 'monthly']);
  });

  it('rough: D=30 -> week', () => {
    const output = resolveGranularityPlan({ mode: 'rough', durationDays: 30 });
    expect(output.slots).toEqual(['week']);
    expect(output.summaries).toEqual([]);
  });
});

