import { reactive } from 'vue';
import { getAdminApiClient } from '../lib/api-client';

const storageKey = 'ai-plan-admin-token';

export const adminAuthState = reactive({
  token: localStorage.getItem(storageKey) ?? '',
});

export const adminProfile = reactive({
  email: '',
  permissions: [] as string[],
});

export function setAdminToken(token: string) {
  adminAuthState.token = token;
  localStorage.setItem(storageKey, token);
}

export function clearAdminToken() {
  adminAuthState.token = '';
  localStorage.removeItem(storageKey);
  adminProfile.email = '';
  adminProfile.permissions = [];
}

/** 用当前 token 拉取 /auth/admin/me；失败返回 false（调用方可选择清 token） */
export async function hydrateAdminProfile(): Promise<boolean> {
  if (!adminAuthState.token?.trim()) {
    adminProfile.email = '';
    adminProfile.permissions = [];
    return false;
  }
  try {
    const me = await getAdminApiClient().getAdminMe(adminAuthState.token);
    adminProfile.email = me.email;
    adminProfile.permissions = me.permissions;
    return true;
  } catch {
    adminProfile.email = '';
    adminProfile.permissions = [];
    return false;
  }
}
