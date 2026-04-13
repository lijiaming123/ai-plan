<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UserAvatarBadge from '../components/UserAvatarBadge.vue';
import { avatarLabel, refreshDisplayProfileFromStorage } from '../stores/display-profile';
import { authState, clearAuthToken } from '../stores/auth';
import { planListSearchQuery } from '../stores/plan-search-query';

const route = useRoute();
const router = useRouter();

const activeNav = computed(() => (typeof route.meta.nav === 'string' ? route.meta.nav : ''));

const showPlanSearch = computed(() => route.name === 'plan-overview');

const tierLabel = computed(() => (authState.tier === 'pro' ? '专业版' : '基础版'));

const displayEmail = computed(() => authState.userEmail || '未登录邮箱');

function navLinkClass(nav: string) {
  const on = activeNav.value === nav;
  return on
    ? 'flex items-center gap-3 rounded-xl bg-[#eef9f3] px-3 py-2 text-[#0a8f4a]'
    : 'flex items-center gap-3 rounded-xl px-3 py-2 text-[#6e7b75]';
}

function navTextClass(nav: string) {
  return activeNav.value === nav ? 'text-[15px] font-semibold' : 'text-[15px] font-medium';
}

function goUpgrade() {
  void router.push({ path: '/settings', query: { focus: 'pro' } });
}

function goNotifications() {
  void router.push('/notifications');
}

function logout() {
  clearAuthToken();
  planListSearchQuery.value = '';
  void router.push('/auth/login');
}

onMounted(() => {
  refreshDisplayProfileFromStorage();
});
</script>

<template>
  <div class="relative flex h-screen w-full overflow-hidden bg-[#f5f7f6] font-display text-[#111813]">
    <aside class="hidden h-screen w-[220px] shrink-0 flex-col justify-between border-r border-[#e6ebe8] bg-[#f5f7f6] px-5 py-5 lg:flex">
      <div class="flex min-h-0 flex-1 flex-col gap-7">
        <div>
          <h2 class="text-[30px] font-black leading-8 tracking-[-0.03em]">计划大师</h2>
          <p class="mt-1 text-sm text-[#7c8a84]">PlanMaster System</p>
        </div>
        <nav class="ui-scrollbar flex flex-col gap-1 overflow-y-auto pr-0.5">
          <router-link to="/dashboard" :class="navLinkClass('dashboard')" data-testid="nav-dashboard">
            <span class="material-symbols-outlined text-[20px]">dashboard</span>
            <span :class="navTextClass('dashboard')">仪表盘</span>
          </router-link>
          <router-link to="/plans" :class="navLinkClass('plans')" data-testid="nav-plans">
            <span class="material-symbols-outlined text-[20px]">folder</span>
            <span :class="navTextClass('plans')">我的计划</span>
          </router-link>
          <router-link to="/templates" :class="navLinkClass('templates')" data-testid="nav-templates">
            <span class="material-symbols-outlined text-[20px]">layers</span>
            <span :class="navTextClass('templates')">模板</span>
          </router-link>
          <router-link to="/archive" :class="navLinkClass('archive')" data-testid="nav-archive">
            <span class="material-symbols-outlined text-[20px]">inventory_2</span>
            <span :class="navTextClass('archive')">归档</span>
          </router-link>
          <router-link to="/insights" :class="navLinkClass('insights')" data-testid="nav-insights">
            <span class="material-symbols-outlined text-[20px]">bar_chart</span>
            <span :class="navTextClass('insights')">统计分析</span>
          </router-link>
          <router-link to="/notifications" :class="navLinkClass('notifications')" data-testid="nav-notifications">
            <span class="material-symbols-outlined text-[20px]">notifications</span>
            <span :class="navTextClass('notifications')">通知中心</span>
          </router-link>
          <router-link to="/settings" :class="navLinkClass('settings')" data-testid="nav-settings">
            <span class="material-symbols-outlined text-[20px]">settings</span>
            <span :class="navTextClass('settings')">设置</span>
          </router-link>
        </nav>
      </div>
      <div class="mt-4 shrink-0 space-y-3 border-t border-[#e6ebe8] pt-4">
        <button
          type="button"
          class="h-12 w-full rounded-xl bg-primary text-sm font-bold text-[#111813]"
          data-testid="sidebar-upgrade"
          @click="goUpgrade"
        >
          获取专业版
        </button>
        <router-link
          to="/help"
          class="flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium text-[#5d6a64] transition hover:text-[#0a8f4a]"
          data-testid="sidebar-help"
        >
          <span class="material-symbols-outlined text-[18px]">help</span>
          帮助与反馈
        </router-link>
        <p class="text-center text-[10px] text-[#a8b5af]">PlanMaster v0.1</p>
      </div>
    </aside>

    <main class="h-screen flex-1 overflow-hidden px-3 py-4 sm:px-4 sm:py-5">
      <div class="flex h-full w-full flex-col">
        <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div v-if="showPlanSearch" class="relative min-w-[200px] max-w-[320px] flex-1">
            <span class="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8d9993]">search</span>
            <input
              v-model="planListSearchQuery"
              class="h-11 w-full rounded-xl border border-[#e5ebe7] bg-white pl-10 pr-4 text-sm outline-none focus:border-primary/40"
              placeholder="搜索计划..."
              data-testid="header-plan-search"
              aria-label="搜索计划"
            />
          </div>
          <div v-else class="min-w-[120px] flex-1" aria-hidden="true" />

          <div class="flex items-center gap-3" :class="{ 'ml-auto': !showPlanSearch }">
            <router-link
              to="/plans/new"
              class="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-[#111813]"
              data-testid="header-create-plan"
            >
              创建新计划
            </router-link>
            <button
              type="button"
              class="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-transparent text-[#555] hover:bg-white/80"
              aria-label="通知"
              data-testid="header-notifications"
              @click="goNotifications"
            >
              <span class="material-symbols-outlined">notifications</span>
            </button>
            <ElDropdown trigger="click" data-testid="header-user-menu" popper-class="user-menu-popper">
              <button
                type="button"
                class="group flex h-11 max-w-[220px] items-center gap-2 rounded-xl border border-[#e5ebe7] bg-white/95 px-2 pl-2 shadow-sm ring-1 ring-white/80 transition hover:border-[#0a8f4a]/35 hover:shadow-md"
                aria-label="用户菜单"
              >
                <UserAvatarBadge variant="header" :label="avatarLabel" />
                <div class="hidden min-w-0 flex-1 text-left sm:block">
                  <p class="truncate text-xs font-semibold leading-tight text-[#111813]">{{ displayEmail }}</p>
                  <p class="text-[10px] leading-tight text-[#7c8a84]">{{ tierLabel }}</p>
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
                  <div class="user-menu-dropdown-summary" data-testid="dropdown-user-summary">
                    <div class="user-menu-dropdown-avatar-wrap">
                      <!-- :key 避免 Teleport 复用节点时与顶栏头像首字不同步 -->
                      <UserAvatarBadge :key="avatarLabel" variant="menu" :label="avatarLabel" />
                    </div>
                    <div class="user-menu-dropdown-identity">
                      <p class="user-menu-dropdown-kicker">当前登录</p>
                      <p class="user-menu-dropdown-email" :title="displayEmail">{{ displayEmail }}</p>
                      <p class="user-menu-dropdown-tier-row">
                        <span class="user-menu-dropdown-tier">{{ tierLabel }}</span>
                      </p>
                    </div>
                  </div>

                  <div class="user-menu-dropdown-nav" role="group" aria-label="账户操作">
                    <ElDropdownItem class="user-menu-nav-item" data-testid="dropdown-account" @click="router.push('/settings')">
                      <span class="user-menu-item-inner">
                        <span class="user-menu-item-icon" aria-hidden="true">
                          <span class="material-symbols-outlined">person</span>
                        </span>
                        <span class="user-menu-item-label">用户中心</span>
                      </span>
                    </ElDropdownItem>
                    <ElDropdownItem class="user-menu-nav-item" data-testid="dropdown-help" @click="router.push('/help')">
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
                        <span class="user-menu-item-icon user-menu-item-icon--danger" aria-hidden="true">
                          <span class="material-symbols-outlined user-menu-logout-icon">logout</span>
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
