import { reactive } from 'vue';

const storageKey = 'ai-plan-token';

export const authState = reactive({
  token: localStorage.getItem(storageKey) ?? '',
});

export function setAuthToken(token: string) {
  authState.token = token;
  localStorage.setItem(storageKey, token);
}

export function clearAuthToken() {
  authState.token = '';
  localStorage.removeItem(storageKey);
}
