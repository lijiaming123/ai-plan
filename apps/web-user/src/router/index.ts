import { createRouter, createWebHistory, createMemoryHistory, type RouterHistory } from 'vue-router';
import { authState } from '../stores/auth';
import { trackPageView } from '../lib/telemetry';

// 路由懒加载：首屏只加载壳层与必要代码，页面按需拉取
const isTest = import.meta.env.MODE === 'test';

const UserShellLayout = isTest
  ? (await import('../layouts/UserShellLayout.vue')).default
  : () => import('../layouts/UserShellLayout.vue');

const LoginPage = isTest
  ? (await import('../features/auth/LoginPage.vue')).default
  : () => import('../features/auth/LoginPage.vue');
const ForgotPasswordPage = isTest
  ? (await import('../features/auth/ForgotPasswordPage.vue')).default
  : () => import('../features/auth/ForgotPasswordPage.vue');

const DashboardPage = isTest
  ? (await import('../features/dashboard/DashboardPage.vue')).default
  : () => import('../features/dashboard/DashboardPage.vue');
const PlanOverviewPage = isTest
  ? (await import('../features/plans/PlanOverviewPage.vue')).default
  : () => import('../features/plans/PlanOverviewPage.vue');
const PlanCreatePage = isTest
  ? (await import('../features/plans/PlanCreatePage.vue')).default
  : () => import('../features/plans/PlanCreatePage.vue');
const PlanDetailPage = isTest
  ? (await import('../features/plans/PlanDetailPage.vue')).default
  : () => import('../features/plans/PlanDetailPage.vue');
const PlanDraftPage = isTest
  ? (await import('../features/plans/PlanDraftPage.vue')).default
  : () => import('../features/plans/PlanDraftPage.vue');
const PlanTrashPage = isTest
  ? (await import('../features/plans/PlanTrashPage.vue')).default
  : () => import('../features/plans/PlanTrashPage.vue');

const TemplatesPage = isTest
  ? (await import('../features/templates/TemplatesPage.vue')).default
  : () => import('../features/templates/TemplatesPage.vue');
const TemplateMarketDetailPage = isTest
  ? (await import('../features/templates/TemplateMarketDetailPage.vue')).default
  : () => import('../features/templates/TemplateMarketDetailPage.vue');
const SettingsPage = isTest
  ? (await import('../features/settings/SettingsPage.vue')).default
  : () => import('../features/settings/SettingsPage.vue');
const ArchivePage = isTest
  ? (await import('../features/archive/ArchivePage.vue')).default
  : () => import('../features/archive/ArchivePage.vue');
const InsightsPage = isTest
  ? (await import('../features/insights/InsightsPage.vue')).default
  : () => import('../features/insights/InsightsPage.vue');
const HelpPage = isTest
  ? (await import('../features/help/HelpPage.vue')).default
  : () => import('../features/help/HelpPage.vue');
const NotificationsPage = isTest
  ? (await import('../features/notifications/NotificationsPage.vue')).default
  : () => import('../features/notifications/NotificationsPage.vue');

const TaskSubmitPage = isTest
  ? (await import('../features/submissions/TaskSubmitPage.vue')).default
  : () => import('../features/submissions/TaskSubmitPage.vue');
const SubmissionResultPage = isTest
  ? (await import('../features/submissions/SubmissionResultPage.vue')).default
  : () => import('../features/submissions/SubmissionResultPage.vue');

export function createAppRouter(history: RouterHistory = createWebHistory()) {
  const pageViewRouteNames = new Set([
    'dashboard',
    'plan-overview',
    'plan-create',
    'plan-draft',
    'plan-detail',
    'templates',
    'template-market-detail',
    'template-preset-detail',
    'notifications',
    'task-submit',
  ]);
  const router = createRouter({
    history,
    routes: [
      { path: '/auth/login', name: 'login', component: LoginPage },
      { path: '/auth/register', name: 'register', component: LoginPage },
      { path: '/auth/forgot-password', name: 'forgot-password', component: ForgotPasswordPage },
      {
        path: '/templates/market/:id',
        name: 'template-market-detail',
        component: TemplateMarketDetailPage,
      },
      {
        path: '/templates/presets/:id',
        name: 'template-preset-detail',
        component: TemplateMarketDetailPage,
      },
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
            path: 'plans/trash',
            name: 'plan-trash',
            component: PlanTrashPage,
            meta: { nav: 'plans', requiresAuth: true },
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

  router.afterEach((to) => {
    if (!pageViewRouteNames.has(String(to.name ?? ''))) return;
    trackPageView(to.fullPath);
  });

  return router;
}

export const router = createAppRouter();
export const memoryRouter = () => createAppRouter(createMemoryHistory());
