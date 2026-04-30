import { reactive } from 'vue';

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

export function clearAuthToken() {
  authState.token = '';
  authState.tier = 'basic';
  authState.userPhone = '';
  authState.userId = '';
  localStorage.removeItem(storageKey);
  localStorage.removeItem(tierStorageKey);
  localStorage.removeItem(emailStorageKey);
  localStorage.removeItem(phoneStorageKey);
  localStorage.removeItem(userIdStorageKey);
  localStorage.removeItem('ai-plan-display-name');
}
