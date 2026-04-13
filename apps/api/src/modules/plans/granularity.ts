/**
 * 计划「颗粒度」解析：把用户选择的模式（智能 / 深度 / 粗略）与计划跨度（天数）换算成
 * - 时间槽类型 slots：任务按「天」还是按「周」排期（决定后续为每个任务生成 timeSlotKey）
 * - 总结类任务 summaries：是否在阶段下追加「本周总结」「本月总结」等占位任务
 *
 * 与 plan.service 中 withTimeSlots 配合：先由 ai-engine 产出阶段与行动项，再按本规则补全
 * timeSlotType / timeSlotKey / taskType（weekly_summary、monthly_summary）。
 *
 * 模式说明：
 * - smart：短周期（少于 30 天）当 deep，长周期当 rough，避免长计划仍按天铺任务导致爆炸。
 * - deep：偏执行细粒度，尽量按天；跨度够长时加周/月总结便于复盘。
 * - rough：偏里程碑式，≥30 天时用「周」槽位，减少日级任务数量。
 */
export type GranularityMode = 'smart' | 'deep' | 'rough';

/** 单条任务绑定的时间维度：日槽、周槽或月槽（总结任务常用 week/month） */
export type SlotType = 'day' | 'week' | 'month';

/** 在阶段末尾自动插入的总结任务类型 */
export type SummaryType = 'weekly' | 'monthly';

/**
 * 根据颗粒度模式与计划持续天数，解析出时间槽与总结策略。
 *
 * @param input.mode - 用户或模板传入的颗粒度；smart 会先被映射为 deep 或 rough
 * @param input.durationDays - 起始日到截止日的「包含端点」天数，至少按 1 天计
 * @returns
 *   - mode：实际生效的模式（smart 映射后的 deep/rough）
 *   - slots：非空数组，withTimeSlots 只取 slots[0] 作为整计划统一槽类型
 *   - summaries：要在每个阶段追加的周/月总结类型列表（可为空）
 *
 * 分支要点（与产品预期一致即可，调整规则时同步改单测 plan-granularity）：
 * - deep + 极短周期（少于 7 天）：只按天，不加总结
 * - deep + 7～29 天：按天 + 周总结
 * - deep + ≥30 天：按天 + 周总结 + 月总结
 * - rough（或 smart 落到 rough）且 ≥30 天：按周槽；少于 30 天仍按天且无总结
 */
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
