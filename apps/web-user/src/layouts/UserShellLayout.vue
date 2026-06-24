<script setup lang="ts">
import { ElTooltip } from "element-plus";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import UserAvatarBadge from "../components/UserAvatarBadge.vue";
import {
  avatarLabel,
  refreshDisplayProfileFromStorage,
} from "../stores/display-profile";
import { authState, clearAuthToken } from "../stores/auth";
import { getApiClient } from "../lib/api-client";
import { planListSearchQuery } from "../stores/plan-search-query";
import {
  shellSidebarCollapsed,
  toggleShellSidebar,
} from "../stores/shell-sidebar";
import { isTemplatesFeatureEnabled } from "../lib/feature-flags";
import { useTierBadge } from "../composables/useTierBadge";

const route = useRoute();
const router = useRouter();

const activeNav = computed(() =>
  typeof route.meta.nav === "string" ? route.meta.nav : "",
);

const showPlanSearch = computed(() => route.name === "plan-overview");

const { tierBadgeLabel: tierLabel } = useTierBadge();

const displayPhone = computed(() => authState.userPhone || "未登录手机号");

function navLinkClass(nav: string) {
  const on = activeNav.value === nav;
  const collapsed = shellSidebarCollapsed.value;
  const base = collapsed
    ? "flex items-center justify-center rounded-xl px-2 py-2.5"
    : "flex items-center gap-3 rounded-xl px-3 py-2";
  if (on) {
    return `${base} bg-[#eef9f3] text-[#0a8f4a]`;
  }
  return `${base} text-[#6e7b75]`;
}

function navTextClass(nav: string) {
  return activeNav.value === nav
    ? "text-[15px] font-semibold"
    : "text-[15px] font-medium";
}

const sidebarToggleLabel = computed(() =>
  shellSidebarCollapsed.value ? "展开侧栏" : "收起侧栏",
);

const primaryNavItems = [
  {
    to: "/dashboard",
    nav: "dashboard",
    icon: "dashboard",
    label: "概览",
    testid: "nav-dashboard",
  },
  {
    to: "/plans",
    nav: "plans",
    icon: "folder",
    label: "我的计划",
    testid: "nav-plans",
  },
  {
    to: "/templates",
    nav: "templates",
    icon: "layers",
    label: "模板",
    testid: "nav-templates",
  },
  {
    to: "/archive",
    nav: "archive",
    icon: "inventory_2",
    label: "归档",
    testid: "nav-archive",
  },
  {
    to: "/insights",
    nav: "insights",
    icon: "bar_chart",
    label: "统计分析",
    testid: "nav-insights",
  },
  {
    to: "/notifications",
    nav: "notifications",
    icon: "notifications",
    label: "通知中心",
    testid: "nav-notifications",
  },
  {
    to: "/settings",
    nav: "settings",
    icon: "settings",
    label: "设置",
    testid: "nav-settings",
  },
] as const;

/** 部署方可将 VITE_FEATURE_ARCHIVE / VITE_FEATURE_INSIGHTS 设为 false 隐藏侧栏入口（默认可用）。 */
/** MVP 默认关闭 VITE_FEATURE_TEMPLATES；设为 true/1 时显示「模板」导航。 */
const visiblePrimaryNavItems = computed(() =>
  primaryNavItems.filter((item) => {
    if (item.nav === "templates") {
      return isTemplatesFeatureEnabled();
    }
    if (item.nav === "archive") {
      const v = import.meta.env.VITE_FEATURE_ARCHIVE as string | undefined;
      return v !== "false" && v !== "0";
    }
    if (item.nav === "insights") {
      const v = import.meta.env.VITE_FEATURE_INSIGHTS as string | undefined;
      return v !== "false" && v !== "0";
    }
    return true;
  }),
);

function goUpgrade() {
  void router.push({ path: "/settings", query: { focus: "pro" } });
}

const notifUnread = ref(0);

async function refreshNotifUnread() {
  if (!authState.token) {
    notifUnread.value = 0;
    return;
  }
  try {
    const { unreadCount } = await getApiClient().getNotificationsUnreadCount({
      token: authState.token,
    });
    notifUnread.value = unreadCount;
  } catch {
    notifUnread.value = 0;
  }
}

function goNotifications() {
  void router.push("/notifications");
}

function logout() {
  clearAuthToken();
  planListSearchQuery.value = "";
  void router.push("/auth/login");
}

onMounted(() => {
  refreshDisplayProfileFromStorage();
  void refreshNotifUnread();
});

watch(
  () => [authState.token, route.path],
  () => {
    void refreshNotifUnread();
  },
);

if (typeof window !== "undefined") {
  window.addEventListener("notif-refresh", () => {
    void refreshNotifUnread();
  });
}
</script>

<template>
  <div
    class="relative flex h-screen w-full overflow-hidden bg-[#f5f7f6] font-display text-[#111813]"
  >
    <aside
      class="shell-sidebar hidden h-screen shrink-0 flex-col justify-between overflow-x-hidden border-r border-[#e6ebe8] bg-[#f5f7f6] py-5 transition-[width,padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] lg:flex"
      :class="shellSidebarCollapsed ? 'w-[72px] px-2' : 'w-[220px] px-5'"
    >
      <div class="flex min-h-0 flex-1 flex-col gap-6">
        <div
          class="shrink-0"
          :class="
            shellSidebarCollapsed ? 'flex flex-col items-center gap-2' : ''
          "
        >
          <div
            class="flex items-start gap-2"
            :class="
              shellSidebarCollapsed ? 'justify-center' : 'justify-between'
            "
          >
            <!-- 用 grid 列 1fr→0fr 收合，避免 max-width 动画中间态挤压文字导致闪烁 -->
            <div
              class="shell-sidebar-brand-text grid min-w-0 flex-1 overflow-hidden transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
              :class="
                shellSidebarCollapsed
                  ? 'pointer-events-none grid-cols-[0fr]'
                  : 'grid-cols-[minmax(0,1fr)]'
              "
              :aria-hidden="shellSidebarCollapsed ? 'true' : 'false'"
            >
              <div class="min-w-0 overflow-hidden">
                <div class="w-max shrink-0">
                  <h2
                    class="whitespace-nowrap text-[30px] font-black leading-8 tracking-[-0.03em]"
                  >
                    计划大师
                  </h2>
                </div>
              </div>
            </div>
            <button
              type="button"
              class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e0e8e4] bg-white/90 text-[#5d6a64] shadow-sm transition hover:border-[#0a8f4a]/30 hover:text-[#0a8f4a]"
              :aria-label="sidebarToggleLabel"
              data-testid="sidebar-collapse-toggle"
              @click="toggleShellSidebar"
            >
              <span class="material-symbols-outlined text-[22px]">{{
                shellSidebarCollapsed ? "chevron_right" : "chevron_left"
              }}</span>
            </button>
          </div>
        </div>
        <nav class="ui-scrollbar flex flex-col gap-1 overflow-y-auto pr-0.5">
          <ElTooltip
            v-for="item in visiblePrimaryNavItems"
            :key="item.nav"
            :disabled="!shellSidebarCollapsed"
            :content="item.label"
            placement="right-start"
            :offset="14"
            :show-after="280"
            :hide-after="80"
            effect="light"
            popper-class="shell-sidebar-tooltip"
          >
            <router-link
              :to="item.to"
              :class="navLinkClass(item.nav)"
              :data-testid="item.testid"
              class="outline-none ring-inset focus-visible:ring-2 focus-visible:ring-primary/35"
            >
              <span class="material-symbols-outlined shrink-0 text-[20px]">{{
                item.icon
              }}</span>
              <span
                class="shell-nav-label overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
                :class="[
                  navTextClass(item.nav),
                  shellSidebarCollapsed
                    ? 'max-w-0 -translate-x-3 opacity-0'
                    : 'max-w-[168px] translate-x-0 opacity-100',
                ]"
                :aria-hidden="shellSidebarCollapsed ? 'true' : 'false'"
                >{{ item.label }}</span
              >
            </router-link>
          </ElTooltip>
        </nav>
      </div>
      <div class="mt-4 shrink-0 space-y-3 border-t border-[#e6ebe8] pt-4">
        <ElTooltip
          :disabled="!shellSidebarCollapsed"
          content="获取专业版"
          placement="right-start"
          :offset="14"
          :show-after="280"
          effect="light"
          popper-class="shell-sidebar-tooltip"
        >
          <button
            type="button"
            class="rounded-xl bg-primary font-bold text-[#111813] transition hover:brightness-[1.02]"
            :class="
              shellSidebarCollapsed
                ? 'mx-auto flex h-11 w-11 items-center justify-center p-0'
                : 'h-12 w-full text-sm'
            "
            data-testid="sidebar-upgrade"
            @click="goUpgrade"
          >
            <span
              v-if="shellSidebarCollapsed"
              class="material-symbols-outlined text-[22px]"
              >workspace_premium</span
            >
            <span v-else>获取专业版</span>
          </button>
        </ElTooltip>
        <ElTooltip
          :disabled="!shellSidebarCollapsed"
          content="帮助与反馈"
          placement="right-start"
          :offset="14"
          :show-after="280"
          effect="light"
          popper-class="shell-sidebar-tooltip"
        >
          <router-link
            to="/help"
            class="flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium text-[#5d6a64] transition hover:text-[#0a8f4a] outline-none ring-inset focus-visible:ring-2 focus-visible:ring-primary/35"
            :class="shellSidebarCollapsed ? 'flex-col gap-0.5 px-0' : ''"
            data-testid="sidebar-help"
          >
            <span class="material-symbols-outlined text-[18px]">help</span>
            <span
              class="shell-nav-label overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
              :class="
                shellSidebarCollapsed
                  ? 'max-w-0 -translate-x-3 opacity-0'
                  : 'max-w-[120px] translate-x-0 opacity-100'
              "
              :aria-hidden="shellSidebarCollapsed ? 'true' : 'false'"
              >帮助与反馈</span
            >
          </router-link>
        </ElTooltip>
      </div>
    </aside>

    <main class="h-screen flex-1 overflow-hidden px-3 py-4 sm:px-4 sm:py-5">
      <div class="flex h-full w-full flex-col">
        <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div
            v-if="showPlanSearch"
            class="relative min-w-[200px] max-w-[min(100%,420px)] flex-1"
          >
            <span
              class="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8d9993]"
              >search</span
            >
            <input
              v-model="planListSearchQuery"
              class="h-11 w-full rounded-xl border border-[#e5ebe7] bg-white pl-10 pr-4 text-sm outline-none focus:border-primary/40"
              placeholder="搜索计划..."
              data-testid="header-plan-search"
              aria-label="搜索计划"
            />
          </div>
          <div v-else class="min-w-[120px] flex-1" aria-hidden="true" />

          <div
            class="flex items-center gap-3"
            :class="{ 'ml-auto': !showPlanSearch }"
          >
            <router-link
              to="/plans/new"
              class="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-[#111813]"
              data-testid="header-create-plan"
            >
              创建新计划
            </router-link>
            <button
              type="button"
              class="relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-transparent text-[#555] hover:bg-white/80"
              :aria-label="
                notifUnread > 0 ? `通知，有 ${notifUnread} 条未读` : '通知'
              "
              data-testid="header-notifications"
              @click="goNotifications"
            >
              <span class="material-symbols-outlined">notifications</span>
              <span
                v-if="notifUnread > 0"
                class="absolute right-1.5 top-1.5 min-w-[1.125rem] rounded-full bg-amber-500 px-0.5 text-center text-[10px] font-black leading-4 text-[#0f1f0c] ring-1 ring-amber-200/90"
                data-testid="header-notifications-badge"
                >{{ notifUnread > 9 ? "9+" : notifUnread }}</span
              >
            </button>
            <ElDropdown
              trigger="click"
              data-testid="header-user-menu"
              popper-class="user-menu-popper"
            >
              <button
                type="button"
                class="group flex h-11 max-w-[220px] items-center gap-2 rounded-xl border border-[#e5ebe7] bg-white/95 px-2 pl-2 shadow-sm ring-1 ring-white/80 transition hover:border-[#0a8f4a]/35 hover:shadow-md"
                aria-label="用户菜单"
              >
                <UserAvatarBadge variant="header" :label="avatarLabel" />
                <div class="hidden min-w-0 flex-1 text-left sm:block">
                  <p
                    class="truncate text-xs font-semibold leading-tight text-[#111813]"
                  >
                    {{ displayPhone }}
                  </p>
                  <p class="text-[10px] leading-tight text-[#7c8a84]">
                    {{ tierLabel }}
                  </p>
                </div>
                <span
                  class="material-symbols-outlined hidden shrink-0 text-[20px] text-[#8d9993] transition group-hover:text-[#0a8f4a] sm:inline"
                  >expand_more</span
                >
              </button>
              <template #dropdown>
                <ElDropdownMenu
                  class="user-menu-dropdown-list !max-w-[min(19rem,calc(100vw-1.5rem))] !border-0 !bg-transparent !p-0 !shadow-none"
                >
                  <div
                    class="user-menu-dropdown-summary"
                    data-testid="dropdown-user-summary"
                  >
                    <div class="user-menu-dropdown-avatar-wrap">
                      <!-- :key 避免 Teleport 复用节点时与顶栏头像首字不同步 -->
                      <UserAvatarBadge
                        :key="avatarLabel"
                        variant="menu"
                        :label="avatarLabel"
                      />
                    </div>
                    <div class="user-menu-dropdown-identity">
                      <p class="user-menu-dropdown-kicker">当前登录</p>
                      <p class="user-menu-dropdown-email" :title="displayPhone">
                        {{ displayPhone }}
                      </p>
                      <p class="user-menu-dropdown-tier-row">
                        <span class="user-menu-dropdown-tier">{{
                          tierLabel
                        }}</span>
                      </p>
                    </div>
                  </div>

                  <div
                    class="user-menu-dropdown-nav"
                    role="group"
                    aria-label="账户操作"
                  >
                    <ElDropdownItem
                      class="user-menu-nav-item"
                      data-testid="dropdown-account"
                      @click="router.push('/settings')"
                    >
                      <span class="user-menu-item-inner">
                        <span class="user-menu-item-icon" aria-hidden="true">
                          <span class="material-symbols-outlined">person</span>
                        </span>
                        <span class="user-menu-item-label">用户中心</span>
                      </span>
                    </ElDropdownItem>
                    <ElDropdownItem
                      class="user-menu-nav-item"
                      data-testid="dropdown-help"
                      @click="router.push('/help')"
                    >
                      <span class="user-menu-item-inner">
                        <span class="user-menu-item-icon" aria-hidden="true">
                          <span class="material-symbols-outlined">help</span>
                        </span>
                        <span class="user-menu-item-label">帮助与反馈</span>
                      </span>
                    </ElDropdownItem>
                    <ElDropdownItem
                      divided
                      class="user-menu-nav-item user-menu-logout-item"
                      data-testid="dropdown-logout"
                      @click="logout"
                    >
                      <span class="user-menu-item-inner">
                        <span
                          class="user-menu-item-icon user-menu-item-icon--danger"
                          aria-hidden="true"
                        >
                          <span
                            class="material-symbols-outlined user-menu-logout-icon"
                            >logout</span
                          >
                        </span>
                        <span class="user-menu-item-label">退出登录</span>
                      </span>
                    </ElDropdownItem>
                  </div>
                </ElDropdownMenu>
              </template>
            </ElDropdown>
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-hidden">
          <router-view />
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
@media (prefers-reduced-motion: reduce) {
  .shell-sidebar,
  .shell-sidebar-brand-text,
  .shell-nav-label,
  .shell-sidebar-footer-meta {
    transition-duration: 0.01ms !important;
  }
}
</style>

<!-- Popper 挂到 body，需非 scoped -->
<style>
.shell-sidebar-tooltip.el-popper {
  padding: 10px 14px !important;
  border-radius: 12px !important;
  border: 1px solid rgba(10, 143, 74, 0.14) !important;
  background: rgba(255, 255, 255, 0.98) !important;
  box-shadow:
    0 10px 28px -8px rgba(15, 60, 40, 0.18),
    0 0 0 1px rgba(255, 255, 255, 0.8) inset !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  color: #1a2820 !important;
  line-height: 1.35 !important;
  max-width: 220px;
}
.shell-sidebar-tooltip.el-popper .el-popper__arrow::before {
  border-color: rgba(10, 143, 74, 0.12) !important;
  background: rgba(255, 255, 255, 0.98) !important;
}
</style>
