import { reactive } from 'vue';

const storageKey = 'ai-plan-token';
const tierStorageKey = 'ai-plan-tier';
type UserTier = 'basic' | 'pro';

function normalizeTier(input: unknown): UserTier {
  return input === 'pro' ? 'pro' : 'basic';
}

export const authState = reactive({
  token: localStorage.getItem(storageKey) ?? '',
  tier: normalizeTier(localStorage.getItem(tierStorageKey)),
});

export function setAuthToken(token: string) {
  authState.token = token;
  localStorage.setItem(storageKey, token);
}

export function setAuthTier(tier: UserTier) {
  authState.tier = tier;
  localStorage.setItem(tierStorageKey, tier);
}

export function clearAuthToken() {
  authState.token = '';
  authState.tier = 'basic';
  localStorage.removeItem(storageKey);
  localStorage.removeItem(tierStorageKey);
}
