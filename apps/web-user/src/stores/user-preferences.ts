import { reactive } from 'vue';

/** 与通知中心等约定：统一前缀，便于后续对接服务端 */
export const USER_PREFS_STORAGE_KEY = 'ai-plan-user-prefs-v1';

export type UserPreferences = {
  notifications: {
    planDeadline: boolean;
    templateActivity: boolean;
  };
  /** 预留：一期固定 system */
  theme: 'system';
};

const defaultPreferences: UserPreferences = {
  notifications: { planDeadline: true, templateActivity: true },
  theme: 'system',
};

function readStored(): UserPreferences {
  if (typeof localStorage === 'undefined') {
    return { ...defaultPreferences, notifications: { ...defaultPreferences.notifications } };
  }
  try {
    const raw = localStorage.getItem(USER_PREFS_STORAGE_KEY);
    if (!raw) {
      return { ...defaultPreferences, notifications: { ...defaultPreferences.notifications } };
    }
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      notifications: {
        ...defaultPreferences.notifications,
        ...parsed.notifications,
      },
      theme: 'system',
    };
  } catch {
    return { ...defaultPreferences, notifications: { ...defaultPreferences.notifications } };
  }
}

export const userPreferences = reactive<UserPreferences>(readStored());

export function persistUserPreferences() {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(USER_PREFS_STORAGE_KEY, JSON.stringify(userPreferences));
}

export function patchUserPreferences(partial: Partial<UserPreferences>) {
  if (partial.notifications) {
    Object.assign(userPreferences.notifications, partial.notifications);
  }
  if (partial.theme) {
    userPreferences.theme = partial.theme;
  }
  persistUserPreferences();
}

/** 测试用：重置为默认并清本地存储 */
export function resetUserPreferencesForTests() {
  Object.assign(userPreferences, {
    notifications: { ...defaultPreferences.notifications },
    theme: 'system' as const,
  });
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(USER_PREFS_STORAGE_KEY);
  }
}
