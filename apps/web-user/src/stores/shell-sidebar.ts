import { ref, watch } from 'vue';

const STORAGE_KEY = 'ai-plan-shell-sidebar-collapsed-v1';

function readInitial(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** lg+ 侧栏是否收起为仅图标（写入 localStorage） */
export const shellSidebarCollapsed = ref(readInitial());

watch(shellSidebarCollapsed, (collapsed) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    /* ignore quota */
  }
});

export function toggleShellSidebar() {
  shellSidebarCollapsed.value = !shellSidebarCollapsed.value;
}

/** 测试用 */
export function resetShellSidebarForTests() {
  shellSidebarCollapsed.value = false;
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
}
