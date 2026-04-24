import { createMemoryHistory, createRouter, createWebHistory, type RouterHistory } from 'vue-router';
import DashboardPage from '../features/dashboard/DashboardPage.vue';
import FunnelPage from '../features/analytics/FunnelPage.vue';
import RetentionPage from '../features/analytics/RetentionPage.vue';
import PathPage from '../features/analytics/PathPage.vue';
import UsersListPage from '../features/users/UsersListPage.vue';
import UserDetailPage from '../features/users/UserDetailPage.vue';
import RulesPage from '../features/rules/RulesPage.vue';
import SubmissionListPage from '../features/submissions/SubmissionListPage.vue';
import LoginPage from '../features/auth/LoginPage.vue';
import RegisterPage from '../features/auth/RegisterPage.vue';
import { adminAuthState, clearAdminToken } from '../stores/auth';

const guestPaths = new Set(['/admin/login', '/admin/register']);

export function createAdminRouter(history: RouterHistory = createWebHistory()) {
  const router = createRouter({
    history,
    routes: [
      { path: '/admin/login', name: 'admin-login', component: LoginPage },
      { path: '/admin/register', name: 'admin-register', component: RegisterPage },
      { path: '/admin', redirect: '/admin/dashboard' },
      { path: '/admin/dashboard', name: 'admin-dashboard', component: DashboardPage },
      { path: '/admin/analytics/funnel', name: 'admin-funnel', component: FunnelPage },
      { path: '/admin/analytics/retention', name: 'admin-retention', component: RetentionPage },
      { path: '/admin/analytics/path', name: 'admin-path', component: PathPage },
      { path: '/admin/users', name: 'admin-users', component: UsersListPage },
      { path: '/admin/users/:userId', name: 'admin-user-detail', component: UserDetailPage },
      { path: '/admin/rules', name: 'admin-rules', component: RulesPage },
      { path: '/admin/submissions', name: 'admin-submissions', component: SubmissionListPage },
      { path: '/:pathMatch(.*)*', redirect: '/admin/dashboard' },
    ],
  });

  router.beforeEach((to) => {
    if (guestPaths.has(to.path)) {
      if (adminAuthState.token?.trim()) {
        return { path: '/admin/dashboard' };
      }
      return true;
    }
    if (!adminAuthState.token?.trim()) {
      return { path: '/admin/login', query: { redirect: to.fullPath } };
    }
    return true;
  });

  return router;
}

export const router = createAdminRouter();
export const memoryAdminRouter = () => createAdminRouter(createMemoryHistory());
