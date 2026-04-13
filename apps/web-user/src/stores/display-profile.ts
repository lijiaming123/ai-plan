import { computed, reactive, watch } from 'vue';
import { authState } from './auth';

/** 与 Settings 页一致：本机显示名，用于首字头像与右上角头像 */
export const DISPLAY_NAME_KEY = 'ai-plan-display-name';

function readStoredTrimmed(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(DISPLAY_NAME_KEY)?.trim() ?? '';
}

function emailPrefix(email: string): string {
  const i = email.indexOf('@');
  return i > 0 ? email.slice(0, i) : email;
}

export const displayProfileState = reactive({
  /** 与 localStorage 同步的显示名（最多 32 字由设置页约束） */
  localDisplayName: readStoredTrimmed(),
});

/** 从 localStorage 重新载入（路由切换回壳层时可调用） */
export function refreshDisplayProfileFromStorage() {
  displayProfileState.localDisplayName = readStoredTrimmed();
}

/**
 * 写入显示名并同步 reactive，供设置页失焦与壳层头像共用。
 */
export function setDisplayProfileName(raw: string) {
  const v = raw.trim().slice(0, 32);
  displayProfileState.localDisplayName = v;
  if (typeof localStorage === 'undefined') return;
  if (v) localStorage.setItem(DISPLAY_NAME_KEY, v);
  else localStorage.removeItem(DISPLAY_NAME_KEY);
}

/** 首字徽章用：优先本机显示名，否则邮箱 @ 前，再否则占位 */
export const avatarLabel = computed(() => {
  const n = displayProfileState.localDisplayName.trim();
  if (n) return n;
  const e = authState.userEmail;
  return e ? emailPrefix(e) : '?';
});

watch(
  () => authState.token,
  (token) => {
    if (!token) {
      displayProfileState.localDisplayName = '';
    }
  },
);

/** 测试：与 localStorage 一并清空 */
export function resetDisplayProfileForTests() {
  displayProfileState.localDisplayName = '';
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(DISPLAY_NAME_KEY);
  }
}

export { emailPrefix };
