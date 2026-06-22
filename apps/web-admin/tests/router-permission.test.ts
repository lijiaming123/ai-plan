import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { createAdminRouter } from '../src/router';
import { clearAdminToken, setAdminToken } from '../src/stores/auth';
import { setAdminApiClient } from '../src/lib/api-client';
import { createMockAdminApiClient } from './mock-admin-api-client';

describe('admin router permission guard', () => {
  beforeEach(() => {
    clearAdminToken();
  });

  it('redirects to forbidden when the admin lacks page permission', async () => {
    setAdminToken('admin-token');
    setAdminApiClient(createMockAdminApiClient({
      getAdminMe: vi.fn().mockResolvedValue({
        userId: 'admin_1',
        email: 'admin@test.dev',
        role: 'admin',
        permissions: ['analytics:read'],
      }),
    }));

    const router = createAdminRouter(createMemoryHistory());
    await router.push('/admin/users');
    await router.isReady();

    expect(router.currentRoute.value.path).toBe('/admin/forbidden');
    expect(router.currentRoute.value.query.required).toBe('users:read');
  });

  it('auditor defaults to audit logs after login redirect', async () => {
    setAdminToken('admin-token');
    setAdminApiClient(createMockAdminApiClient({
      getAdminMe: vi.fn().mockResolvedValue({
        userId: 'admin_1',
        email: 'admin@test.dev',
        role: 'admin',
        permissions: ['audit:read', 'analytics:export'],
      }),
    }));

    const router = createAdminRouter(createMemoryHistory());
    await router.push('/admin/login');
    await router.isReady();

    expect(router.currentRoute.value.path).toBe('/admin/audit-logs');
  });
});
