import { reactive } from 'vue';

const storageKey = 'ai-plan-admin-token';

export const adminAuthState = reactive({
  token: localStorage.getItem(storageKey) ?? '',
});

export function setAdminToken(token: string) {
  adminAuthState.token = token;
  localStorage.setItem(storageKey, token);
}

export function clearAdminToken() {
  adminAuthState.token = '';
  localStorage.removeItem(storageKey);
}
