import { reactive } from 'vue';

const storageKey = 'ai-plan-token';
const tierStorageKey = 'ai-plan-tier';
const emailStorageKey = 'ai-plan-user-email';
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
  userEmail: localStorage.getItem(emailStorageKey) ?? '',
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

export function setUserEmail(email: string) {
  authState.userEmail = email;
  if (email) {
    localStorage.setItem(emailStorageKey, email);
  } else {
    localStorage.removeItem(emailStorageKey);
  }
}

export function setAuthTier(tier: UserTier) {
  authState.tier = tier;
  localStorage.setItem(tierStorageKey, tier);
}

export function clearAuthToken() {
  authState.token = '';
  authState.tier = 'basic';
  authState.userEmail = '';
  authState.userId = '';
  localStorage.removeItem(storageKey);
  localStorage.removeItem(tierStorageKey);
  localStorage.removeItem(emailStorageKey);
  localStorage.removeItem(userIdStorageKey);
}
