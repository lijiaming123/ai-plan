export type GranularityMode = 'smart' | 'deep' | 'rough';
export type SlotType = 'day' | 'week' | 'month';
export type SummaryType = 'weekly' | 'monthly';

export function resolveGranularityPlan(input: { mode: GranularityMode; durationDays: number }) {
  const d = Math.max(1, Math.floor(input.durationDays));
  const effectiveMode = input.mode === 'smart' ? (d < 30 ? 'deep' : 'rough') : input.mode;

  if (effectiveMode === 'deep') {
    if (d < 7) return { mode: effectiveMode, slots: ['day'] as SlotType[], summaries: [] as SummaryType[] };
    if (d < 30) return { mode: effectiveMode, slots: ['day'] as SlotType[], summaries: ['weekly'] as SummaryType[] };
    return { mode: effectiveMode, slots: ['day'] as SlotType[], summaries: ['weekly', 'monthly'] as SummaryType[] };
  }

  if (d < 30) return { mode: effectiveMode, slots: ['day'] as SlotType[], summaries: [] as SummaryType[] };
  return { mode: effectiveMode, slots: ['week'] as SlotType[], summaries: [] as SummaryType[] };
}

