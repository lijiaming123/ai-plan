import { reactive } from 'vue';
import type { AiQuotaSnapshot, AuthMeResponse, SubscriptionSourceApi } from '../lib/api-client';
import { getApiClient } from '../lib/api-client';

const storageKey = 'ai-plan-token';
const tierStorageKey = 'ai-plan-tier';
const emailStorageKey = 'ai-plan-user-email';
const phoneStorageKey = 'ai-plan-user-phone';
const userIdStorageKey = 'ai-plan-user-id';

function decodeJwtSub(token: string): string {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return '';
    const payload = parts[1]!;
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(padded)) as { sub?: string };
    return typeof json.sub === 'string' ? json.sub : '';
  } catch {
    return '';
  }
}
type UserTier = 'basic' | 'pro';

function normalizeTier(input: unknown): UserTier {
  return input === 'pro' ? 'pro' : 'basic';
}

const initialToken = localStorage.getItem(storageKey) ?? '';
export const authState = reactive({
  token: initialToken,
  tier: normalizeTier(localStorage.getItem(tierStorageKey)),
  // 商业化普通版：手机号为主；兼容旧 key（user-email）避免升级后丢展示信息
  userPhone:
    localStorage.getItem(phoneStorageKey) ??
    localStorage.getItem(emailStorageKey) ??
    '',
  userId: localStorage.getItem(userIdStorageKey) ?? decodeJwtSub(initialToken),
  /** 登录用户本月 AI 配额摘要；无 User 行（演示账号）为 null */
  aiQuota: null as AiQuotaSnapshot | null,
  /** Pro 权益到期（ISO）；null 为不设期限 */
  proExpiresAt: null as string | null,
  proTrialUsed: false,
  subscriptionSource: 'none' as SubscriptionSourceApi,
  billingCycle: 'monthly' as const,
  priceCents: 1900,
});

export function setAuthToken(token: string) {
  authState.token = token;
  const sub = decodeJwtSub(token);
  authState.userId = sub;
  localStorage.setItem(storageKey, token);
  if (sub) {
    localStorage.setItem(userIdStorageKey, sub);
  } else {
    localStorage.removeItem(userIdStorageKey);
  }
}

export function setUserPhone(phone: string) {
  authState.userPhone = phone;
  if (phone) {
    localStorage.setItem(phoneStorageKey, phone);
    // 兼容旧读取路径：同步写入 email key（后续清理）
    localStorage.setItem(emailStorageKey, phone);
  } else {
    localStorage.removeItem(phoneStorageKey);
    localStorage.removeItem(emailStorageKey);
  }
}

/** @deprecated 兼容旧调用；商业化版本请改用 setUserPhone */
export function setUserEmail(email: string) {
  setUserPhone(email);
}

export function setAuthTier(tier: UserTier) {
  authState.tier = tier;
  localStorage.setItem(tierStorageKey, tier);
}

/** 同步登录/GET /auth/me 返回的档位与订阅信息 */
export function setAuthBillingFromMe(
  me: Pick<
    AuthMeResponse,
    | 'planTier'
    | 'aiQuota'
    | 'proExpiresAt'
    | 'proTrialUsed'
    | 'subscriptionSource'
    | 'billingCycle'
    | 'priceCents'
  >,
) {
  authState.aiQuota = me.aiQuota ?? null;
  authState.proExpiresAt =
    typeof me.proExpiresAt === 'string' && me.proExpiresAt ? me.proExpiresAt : null;
  authState.proTrialUsed = me.proTrialUsed === true;
  if (
    me.subscriptionSource === 'none' ||
    me.subscriptionSource === 'trial' ||
    me.subscriptionSource === 'paid'
  ) {
    authState.subscriptionSource = me.subscriptionSource;
  } else if (me.planTier === 'pro') {
    authState.subscriptionSource = 'paid';
  } else {
    authState.subscriptionSource = 'none';
  }
  if (me.billingCycle === 'monthly') {
    authState.billingCycle = 'monthly';
  }
  if (typeof me.priceCents === 'number' && me.priceCents > 0) {
    authState.priceCents = me.priceCents;
  }
  const hasAppUser =
    me.aiQuota != null ||
    me.proTrialUsed != null ||
    me.planTier === 'pro' ||
    me.planTier === 'basic';
  if (hasAppUser && (me.planTier === 'pro' || me.planTier === 'basic')) {
    setAuthTier(me.planTier);
  }
}

export async function refreshAuthBillingFromApi() {
  if (!authState.token) return;
  try {
    const me = await getApiClient().getAuthMe({ token: authState.token });
    setAuthBillingFromMe(me);
  } catch {
    /* 忽略：未登录态或网络错误 */
  }
}

export function clearAuthToken() {
  authState.token = '';
  authState.tier = 'basic';
  authState.userPhone = '';
  authState.userId = '';
  authState.aiQuota = null;
  authState.proExpiresAt = null;
  authState.proTrialUsed = false;
  authState.subscriptionSource = 'none';
  authState.priceCents = 1900;
  localStorage.removeItem(storageKey);
  localStorage.removeItem(tierStorageKey);
  localStorage.removeItem(emailStorageKey);
  localStorage.removeItem(phoneStorageKey);
  localStorage.removeItem(userIdStorageKey);
  localStorage.removeItem('ai-plan-display-name');
}
