<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { adminNavItems, getAdminRoleLabel } from './lib/admin-access';
import { adminAuthState, adminProfile, clearAdminToken, hydrateAdminProfile } from './stores/auth';

const route = useRoute();
const router = useRouter();

const guestPaths = new Set(['/admin/login', '/admin/register']);

const isAuthScreen = computed(() => guestPaths.has(route.path));

const permissionLabel = computed(() => getAdminRoleLabel(adminProfile.permissions));

const visibleNavItems = computed(() =>
  adminNavItems.filter((item) => !item.permission || adminProfile.permissions.includes(item.permission)),
);

const currentSection = computed(
  () => visibleNavItems.value.find((item) => route.path.startsWith(item.to))?.label ?? '控制台',
);

function logout() {
  clearAdminToken();
  void router.push('/admin/login');
}

onMounted(async () => {
  if (!isAuthScreen.value && adminAuthState.token?.trim()) {
    const ok = await hydrateAdminProfile();
    if (!ok) {
      clearAdminToken();
      await router.replace({ path: '/admin/login', query: { redirect: route.fullPath } });
    }
  }
});
</script>

<template>
  <div class="app-shell">
    <template v-if="!isAuthScreen">
      <a class="skip-to-content" href="#main-content">跳到主内容</a>
      <div class="admin-layout">
        <aside class="admin-sidebar">
          <div class="sidebar-brand">
            <span class="sidebar-brand__eyebrow">AI PLAN</span>
            <strong class="sidebar-brand__title">管理端</strong>
            <p class="sidebar-brand__text">简洁看板、用户治理和权限控制都放在这一处。</p>
          </div>

          <nav class="sidebar-nav" aria-label="主导航">
            <router-link
              v-for="item in visibleNavItems"
              :key="item.to"
              class="sidebar-link"
              :to="item.to"
            >
              <span class="sidebar-link__label">{{ item.label }}</span>
            </router-link>
          </nav>

          <section class="sidebar-profile" aria-live="polite">
            <p class="sidebar-profile__label">当前账号</p>
            <strong class="sidebar-profile__email">{{ adminProfile.email || '未识别账号' }}</strong>
            <span class="sidebar-profile__role">{{ permissionLabel }}</span>
            <button type="button" class="ghost-btn sidebar-profile__logout" @click="logout">退出登录</button>
          </section>
        </aside>

        <main id="main-content" class="admin-content" tabindex="-1">
          <header class="content-header">
            <div>
              <p class="content-header__eyebrow">Admin Console</p>
              <h1 class="content-header__title">{{ currentSection }}</h1>
            </div>
            <div class="content-header__meta">
              <span class="content-header__pill">{{ permissionLabel }}</span>
            </div>
          </header>

          <router-view />
        </main>
      </div>
    </template>
    <router-view v-else />
  </div>
</template>

<style scoped>
.admin-layout {
  display: grid;
  grid-template-columns: 272px minmax(0, 1fr);
  min-height: 100vh;
}

.admin-sidebar {
  position: sticky;
  top: 0;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 1.5rem;
  align-self: start;
  min-height: 100vh;
  padding: 1.5rem 1.1rem;
  border-right: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(248, 250, 252, 0.92);
  backdrop-filter: blur(14px);
}

.sidebar-brand {
  padding: 0.35rem 0.3rem;
}

.sidebar-brand__eyebrow {
  display: block;
  margin-bottom: 0.45rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #64748b;
  text-transform: uppercase;
}

.sidebar-brand__title {
  display: block;
  font-size: 1.2rem;
  line-height: 1.2;
  color: #0f172a;
}

.sidebar-brand__text {
  margin: 0.55rem 0 0;
  font-size: 0.88rem;
  line-height: 1.55;
  color: #64748b;
}

.sidebar-nav {
  display: grid;
  gap: 0.35rem;
  align-content: start;
}

.sidebar-link {
  display: flex;
  align-items: center;
  min-height: 2.75rem;
  padding: 0.7rem 0.85rem;
  border-radius: 10px;
  text-decoration: none;
  color: #475569;
  font-size: 0.94rem;
  font-weight: 600;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease;
}

.sidebar-link:hover {
  background: rgba(226, 232, 240, 0.8);
  color: #0f172a;
}

.sidebar-link.router-link-active {
  background: #0f172a;
  color: #f8fafc;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);
}

.sidebar-profile {
  display: grid;
  gap: 0.45rem;
  padding: 1rem;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: #ffffff;
}

.sidebar-profile__label {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #64748b;
  text-transform: uppercase;
}

.sidebar-profile__email {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.94rem;
  color: #0f172a;
}

.sidebar-profile__role {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  min-height: 1.9rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 0.78rem;
  font-weight: 700;
}

.sidebar-profile__logout {
  margin-top: 0.2rem;
}

.admin-content {
  min-width: 0;
  padding: 1.5rem;
}

.content-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin: 0 auto 1rem;
  width: min(1180px, 100%);
}

.content-header__eyebrow {
  margin: 0 0 0.2rem;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #64748b;
  text-transform: uppercase;
}

.content-header__title {
  margin: 0;
  font-size: 1.55rem;
  line-height: 1.2;
  color: #0f172a;
}

.content-header__meta {
  display: flex;
  justify-content: flex-end;
}

.content-header__pill {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0.2rem 0.7rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(255, 255, 255, 0.84);
  color: #334155;
  font-size: 0.8rem;
  font-weight: 700;
}

@media (max-width: 980px) {
  .admin-layout {
    grid-template-columns: 1fr;
  }

  .admin-sidebar {
    position: static;
    min-height: auto;
    border-right: 0;
    border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  }

  .admin-content {
    padding: 1rem;
  }

  .content-header {
    flex-direction: column;
  }
}
</style>
