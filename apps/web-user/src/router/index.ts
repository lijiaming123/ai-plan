import { createRouter, createWebHistory, createMemoryHistory, type RouterHistory } from 'vue-router';
import { authState } from '../stores/auth';
import UserShellLayout from '../layouts/UserShellLayout.vue';
import LoginPage from '../features/auth/LoginPage.vue';
import ForgotPasswordPage from '../features/auth/ForgotPasswordPage.vue';
import DashboardPage from '../features/dashboard/DashboardPage.vue';
import PlanOverviewPage from '../features/plans/PlanOverviewPage.vue';
import PlanCreatePage from '../features/plans/PlanCreatePage.vue';
import PlanDetailPage from '../features/plans/PlanDetailPage.vue';
import PlanDraftPage from '../features/plans/PlanDraftPage.vue';
import TemplatesPage from '../features/templates/TemplatesPage.vue';
import SettingsPage from '../features/settings/SettingsPage.vue';
import ArchivePage from '../features/archive/ArchivePage.vue';
import InsightsPage from '../features/insights/InsightsPage.vue';
import HelpPage from '../features/help/HelpPage.vue';
import NotificationsPage from '../features/notifications/NotificationsPage.vue';
import TaskSubmitPage from '../features/submissions/TaskSubmitPage.vue';
import SubmissionResultPage from '../features/submissions/SubmissionResultPage.vue';

export function createAppRouter(history: RouterHistory = createWebHistory()) {
  const router = createRouter({
    history,
    routes: [
      { path: '/auth/login', name: 'login', component: LoginPage },
      { path: '/auth/register', name: 'register', component: LoginPage },
      { path: '/auth/forgot-password', name: 'forgot-password', component: ForgotPasswordPage },
      {
        path: '/plans/new',
        name: 'plan-create',
        component: PlanCreatePage,
        meta: { requiresAuth: true },
      },
      {
        path: '/',
        component: UserShellLayout,
        meta: { requiresAuth: true },
        children: [
          { path: '', redirect: '/plans' },
          {
            path: 'dashboard',
            name: 'dashboard',
            component: DashboardPage,
            meta: { nav: 'dashboard' },
          },
          {
            path: 'plans',
            name: 'plan-overview',
            component: PlanOverviewPage,
            meta: { nav: 'plans' },
          },
          {
            path: 'plans/:id/draft',
            name: 'plan-draft',
            component: PlanDraftPage,
            meta: { nav: 'plans' },
          },
          {
            path: 'plans/:id',
            name: 'plan-detail',
            component: PlanDetailPage,
            meta: { nav: 'plans' },
          },
          {
            path: 'templates',
            name: 'templates',
            component: TemplatesPage,
            meta: { nav: 'templates' },
          },
          {
            path: 'archive',
            name: 'archive',
            component: ArchivePage,
            meta: { nav: 'archive' },
          },
          {
            path: 'insights',
            name: 'insights',
            component: InsightsPage,
            meta: { nav: 'insights' },
          },
          {
            path: 'notifications',
            name: 'notifications',
            component: NotificationsPage,
            meta: { nav: 'notifications' },
          },
          {
            path: 'help',
            name: 'help',
            component: HelpPage,
            meta: { nav: 'help' },
          },
          {
            path: 'settings',
            name: 'settings',
            component: SettingsPage,
            meta: { nav: 'settings' },
          },
        ],
      },
      {
        path: '/tasks/:taskId/submit',
        name: 'task-submit',
        component: TaskSubmitPage,
        meta: { requiresAuth: true },
      },
      {
        path: '/submissions/:id/result',
        name: 'submission-result',
        component: SubmissionResultPage,
        meta: { requiresAuth: true },
      },
      { path: '/:pathMatch(.*)*', redirect: '/plans' },
    ],
  });

  router.beforeEach((to) => {
    const needAuth = to.matched.some((record) => record.meta.requiresAuth);
    if (needAuth && !authState.token) {
      return '/auth/login';
    }
    return true;
  });

  return router;
}

export const router = createAppRouter();
export const memoryRouter = () => createAppRouter(createMemoryHistory());
