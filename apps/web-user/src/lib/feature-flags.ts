/**
 * C 端功能开关（构建时注入）。
 * MVP 默认关闭模板市场；Phase 2 可通过 VITE_FEATURE_TEMPLATES=true 重新开放。
 */
export function isTemplatesFeatureEnabled(): boolean {
  const v = import.meta.env.VITE_FEATURE_TEMPLATES as string | undefined;
  return v === 'true' || v === '1';
}

/** MVP：模板模块关闭时，在创建页展示内嵌官方预设 */
export function showEmbeddedPresetExamples(): boolean {
  return !isTemplatesFeatureEnabled();
}
