import { createRouter, createWebHistory, createMemoryHistory, type RouterHistory } from 'vue-router';
import { authState } from '../stores/auth';
import LoginPage from '../features/auth/LoginPage.vue';
import PlanCreatePage from '../features/plans/PlanCreatePage.vue';
import PlanDetailPage from '../features/plans/PlanDetailPage.vue';

export function createAppRouter(history: RouterHistory = createWebHistory()) {
  const router = createRouter({
    history,
    routes: [
      { path: '/auth/login', name: 'login', component: LoginPage },
      {
        path: '/plans/new',
        name: 'plan-create',
        component: PlanCreatePage,
        meta: { requiresAuth: true },
      },
      {
        path: '/plans/:id',
        name: 'plan-detail',
        component: PlanDetailPage,
        meta: { requiresAuth: true },
      },
      { path: '/:pathMatch(.*)*', redirect: '/plans/new' },
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
