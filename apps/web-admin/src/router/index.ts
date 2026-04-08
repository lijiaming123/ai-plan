import { createMemoryHistory, createRouter, createWebHistory, type RouterHistory } from 'vue-router';
import DashboardPage from '../features/dashboard/DashboardPage.vue';
import RulesPage from '../features/rules/RulesPage.vue';
import SubmissionListPage from '../features/submissions/SubmissionListPage.vue';

export function createAdminRouter(history: RouterHistory = createWebHistory()) {
  return createRouter({
    history,
    routes: [
      { path: '/admin', redirect: '/admin/dashboard' },
      { path: '/admin/dashboard', name: 'admin-dashboard', component: DashboardPage },
      { path: '/admin/rules', name: 'admin-rules', component: RulesPage },
      { path: '/admin/submissions', name: 'admin-submissions', component: SubmissionListPage },
      { path: '/:pathMatch(.*)*', redirect: '/admin/dashboard' },
    ],
  });
}

export const router = createAdminRouter();
export const memoryAdminRouter = () => createAdminRouter(createMemoryHistory());
