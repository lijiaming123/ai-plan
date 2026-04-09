import { createRouter, createWebHistory, createMemoryHistory, type RouterHistory } from 'vue-router';
import { authState } from '../stores/auth';
import LoginPage from '../features/auth/LoginPage.vue';
import ForgotPasswordPage from '../features/auth/ForgotPasswordPage.vue';
import PlanOverviewPage from '../features/plans/PlanOverviewPage.vue';
import PlanCreatePage from '../features/plans/PlanCreatePage.vue';
import PlanDetailPage from '../features/plans/PlanDetailPage.vue';
import PlanDraftPage from '../features/plans/PlanDraftPage.vue';
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
        path: '/plans',
        name: 'plan-overview',
        component: PlanOverviewPage,
        meta: { requiresAuth: true },
      },
      {
        path: '/plans/new',
        name: 'plan-create',
        component: PlanCreatePage,
        meta: { requiresAuth: true },
      },
      {
        path: '/plans/:id/draft',
        name: 'plan-draft',
        component: PlanDraftPage,
        meta: { requiresAuth: true },
      },
      {
        path: '/plans/:id',
        name: 'plan-detail',
        component: PlanDetailPage,
        meta: { requiresAuth: true },
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
    if (to.meta.requiresAuth && !authState.token) {
      return '/auth/login';
    }
    return true;
  });

  return router;
}

export const router = createAppRouter();
export const memoryRouter = () => createAppRouter(createMemoryHistory());
