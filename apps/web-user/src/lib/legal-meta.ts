/** 法律文档与页脚共用的产品/运营元信息（构建时注入，生产部署请配置 .env） */

export const LEGAL_PRODUCT_NAME = '计划大师';

/** 运营主体法定名称；未配置时使用产品名占位，上线前务必填写 */
export function getLegalOperatorName(): string {
  const v = (import.meta.env.VITE_LEGAL_OPERATOR_NAME as string | undefined)?.trim();
  return v || LEGAL_PRODUCT_NAME;
}

/** 运营主体联系地址（可选） */
export function getLegalOperatorAddress(): string | null {
  const v = (import.meta.env.VITE_LEGAL_OPERATOR_ADDRESS as string | undefined)?.trim();
  return v || null;
}

export function getSupportEmail(): string {
  return (
    (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined)?.trim() ||
    'support@ai-plan.dev'
  );
}

/** 政策/协议生效日期（YYYY-MM-DD）；可通过 VITE_LEGAL_EFFECTIVE_DATE 覆盖 */
export function getLegalEffectiveDate(): string {
  const v = (import.meta.env.VITE_LEGAL_EFFECTIVE_DATE as string | undefined)?.trim();
  return v || '2026-06-22';
}

export const LEGAL_ROUTES = {
  privacy: '/legal/privacy',
  terms: '/legal/terms',
} as const;
