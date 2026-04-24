<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { adminAuthState, adminProfile, clearAdminToken, hydrateAdminProfile } from './stores/auth';

const route = useRoute();
const router = useRouter();

const guestPaths = new Set(['/admin/login', '/admin/register']);

const isAuthScreen = computed(() => guestPaths.has(route.path));

const permissionLabel = computed(() => {
  const p = adminProfile.permissions;
  if (!p?.length) return '受限管理员';
  if (p.includes('rbac:manage')) return '超级管理员';
  if (p.includes('audit:read') && p.includes('analytics:read') && !p.includes('users:read')) {
    return '审计只读';
  }
  if (p.includes('users:read')) return '运营分析';
  return '管理员';
});

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
      <div class="bg-orb orb-a" />
      <div class="bg-orb orb-b" />
      <main id="main-content" class="page-shell" tabindex="-1">
        <nav class="top-nav top-nav--sticky" aria-label="主导航">
          <div class="brand">AI PLAN <span class="brand-mark">ADMIN</span></div>
          <div class="nav-links">
            <router-link class="nav-link" to="/admin/dashboard">总览</router-link>
            <router-link class="nav-link" to="/admin/analytics/funnel">漏斗</router-link>
            <router-link class="nav-link" to="/admin/analytics/retention">留存</router-link>
            <router-link class="nav-link" to="/admin/analytics/path">路径</router-link>
            <router-link class="nav-link" to="/admin/users">用户</router-link>
            <router-link class="nav-link" to="/admin/rules">规则</router-link>
            <router-link class="nav-link" to="/admin/submissions">提交</router-link>
          </div>
          <div v-if="adminAuthState.token" class="nav-user" aria-live="polite">
            <span class="nav-user__meta" :title="adminProfile.permissions.join(', ')">
              <span class="nav-user__email">{{ adminProfile.email || '…' }}</span>
              <span class="nav-user__role">{{ permissionLabel }}</span>
            </span>
            <button type="button" class="ghost-btn nav-user__out" @click="logout">退出</button>
          </div>
        </nav>
        <router-view />
      </main>
    </template>
    <router-view v-else />
  </div>
</template>

<style scoped>
.nav-user {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  margin-left: auto;
}

.nav-user__meta {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  text-align: right;
  max-width: 14rem;
}

.nav-user__email {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-user__role {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--brand-strong);
  letter-spacing: 0.04em;
}

.nav-user__out {
  padding: 0.32rem 0.65rem;
  font-size: 0.82rem;
}

@media (max-width: 960px) {
  .top-nav {
    flex-direction: column;
    align-items: stretch;
  }

  .nav-links {
    justify-content: flex-start;
  }

  .nav-user {
    margin-left: 0;
    justify-content: space-between;
    width: 100%;
  }

  .nav-user__meta {
    text-align: left;
  }
}
</style>
