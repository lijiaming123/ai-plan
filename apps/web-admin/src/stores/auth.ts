import { reactive } from 'vue';
import { getAdminApiClient } from '../lib/api-client';

const storageKey = 'ai-plan-admin-token';

type AdminSessionStatus = 'idle' | 'loading' | 'ready';

export const adminAuthState = reactive({
  token: localStorage.getItem(storageKey) ?? '',
  status: 'idle' as AdminSessionStatus,
});

export const adminProfile = reactive({
  userId: '',
  email: '',
  role: 'admin',
  permissions: [] as string[],
});

let hydrateTask: Promise<boolean> | null = null;

function resetAdminProfile() {
  adminProfile.userId = '';
  adminProfile.email = '';
  adminProfile.role = 'admin';
  adminProfile.permissions = [];
}

export function setAdminToken(token: string) {
  adminAuthState.token = token;
  adminAuthState.status = 'idle';
  localStorage.setItem(storageKey, token);
}

export function clearAdminToken() {
  adminAuthState.token = '';
  adminAuthState.status = 'idle';
  hydrateTask = null;
  localStorage.removeItem(storageKey);
  resetAdminProfile();
}

async function runHydrate() {
  if (!adminAuthState.token?.trim()) {
    adminAuthState.status = 'idle';
    resetAdminProfile();
    return false;
  }

  adminAuthState.status = 'loading';

  try {
    const me = await getAdminApiClient().getAdminMe(adminAuthState.token);
    adminProfile.userId = me.userId;
    adminProfile.email = me.email;
    adminProfile.role = me.role;
    adminProfile.permissions = Array.isArray(me.permissions) ? [...me.permissions] : [];
    adminAuthState.status = 'ready';
    return true;
  } catch {
    adminAuthState.status = 'idle';
    resetAdminProfile();
    return false;
  }
}

export async function hydrateAdminProfile(force = false): Promise<boolean> {
  if (!adminAuthState.token?.trim()) {
    clearAdminToken();
    return false;
  }

  if (!force && adminAuthState.status === 'ready' && adminProfile.email) {
    return true;
  }

  if (!force && hydrateTask) {
    return hydrateTask;
  }

  hydrateTask = runHydrate().finally(() => {
    hydrateTask = null;
  });

  return hydrateTask;
}
