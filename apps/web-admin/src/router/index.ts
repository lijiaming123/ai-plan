import { createMemoryHistory, createRouter, createWebHistory, type RouterHistory } from 'vue-router';
import DashboardPage from '../features/dashboard/DashboardPage.vue';
import FunnelPage from '../features/analytics/FunnelPage.vue';
import RetentionPage from '../features/analytics/RetentionPage.vue';
import PathPage from '../features/analytics/PathPage.vue';
import UsersListPage from '../features/users/UsersListPage.vue';
import UserDetailPage from '../features/users/UserDetailPage.vue';
import RulesPage from '../features/rules/RulesPage.vue';
import SubmissionListPage from '../features/submissions/SubmissionListPage.vue';
import AuditLogsPage from '../features/audit/AuditLogsPage.vue';
import LoginPage from '../features/auth/LoginPage.vue';
import RegisterPage from '../features/auth/RegisterPage.vue';
import ForbiddenPage from '../features/auth/ForbiddenPage.vue';
import AccessControlPage from '../features/access/AccessControlPage.vue';
import { getDefaultAdminPath, hasAdminPermission } from '../lib/admin-access';
import type { AdminPermission } from '../lib/api-client';
import { adminAuthState, adminProfile, clearAdminToken, hydrateAdminProfile } from '../stores/auth';

const guestPaths = new Set(['/admin/login', '/admin/register']);

function requiredPermissionOf(path: unknown): AdminPermission | undefined {
  return typeof path === 'string' ? (path as AdminPermission) : undefined;
}

export function createAdminRouter(history: RouterHistory = createWebHistory()) {
  const router = createRouter({
    history,
    routes: [
      { path: '/admin/login', name: 'admin-login', component: LoginPage },
      { path: '/admin/register', name: 'admin-register', component: RegisterPage },
      { path: '/admin/forbidden', name: 'admin-forbidden', component: ForbiddenPage },
      { path: '/admin/access', name: 'admin-access', component: AccessControlPage },
      {
        path: '/admin/dashboard',
        name: 'admin-dashboard',
        component: DashboardPage,
        meta: { permission: 'analytics:read' },
      },
      {
        path: '/admin/analytics/funnel',
        name: 'admin-funnel',
        component: FunnelPage,
        meta: { permission: 'analytics:read' },
      },
      {
        path: '/admin/analytics/retention',
        name: 'admin-retention',
        component: RetentionPage,
        meta: { permission: 'analytics:read' },
      },
      {
        path: '/admin/analytics/path',
        name: 'admin-path',
        component: PathPage,
        meta: { permission: 'analytics:read' },
      },
      {
        path: '/admin/users',
        name: 'admin-users',
        component: UsersListPage,
        meta: { permission: 'users:read' },
      },
      {
        path: '/admin/users/:userId',
        name: 'admin-user-detail',
        component: UserDetailPage,
        meta: { permission: 'users:read' },
      },
      {
        path: '/admin/rules',
        name: 'admin-rules',
        component: RulesPage,
        meta: { permission: 'analytics:read' },
      },
      {
        path: '/admin/submissions',
        name: 'admin-submissions',
        component: SubmissionListPage,
        meta: { permission: 'analytics:read' },
      },
      {
        path: '/admin/audit-logs',
        name: 'admin-audit-logs',
        component: AuditLogsPage,
        meta: { permission: 'audit:read' },
      },
      { path: '/admin', redirect: '/admin/access' },
      { path: '/:pathMatch(.*)*', redirect: '/admin/access' },
    ],
  });

  router.beforeEach(async (to) => {
    if (to.path === '/admin') {
      if (!adminAuthState.token?.trim()) {
        return { path: '/admin/login', query: { redirect: '/admin/access' } };
      }
    }

    if (guestPaths.has(to.path)) {
      if (adminAuthState.token?.trim()) {
        const ok = await hydrateAdminProfile();
        if (!ok) {
          clearAdminToken();
          return true;
        }
        return { path: getDefaultAdminPath(adminProfile.permissions) };
      }
      return true;
    }

    if (!adminAuthState.token?.trim()) {
      return { path: '/admin/login', query: { redirect: to.fullPath } };
    }

    const ok = await hydrateAdminProfile();
    if (!ok) {
      clearAdminToken();
      return { path: '/admin/login', query: { redirect: to.fullPath } };
    }

    if (to.path === '/admin' || to.path === '/') {
      return { path: getDefaultAdminPath(adminProfile.permissions) };
    }

    if (to.path === '/admin/forbidden') {
      return true;
    }

    const permission = requiredPermissionOf(to.meta.permission);
    if (permission && !hasAdminPermission(adminProfile.permissions, permission)) {
      return {
        path: '/admin/forbidden',
        query: {
          from: to.fullPath,
          required: permission,
        },
      };
    }

    return true;
  });

  return router;
}

export const router = createAdminRouter();
export const memoryAdminRouter = () => createAdminRouter(createMemoryHistory());
