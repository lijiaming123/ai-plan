import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { createAdminRouter } from '../src/router';
import { clearAdminToken, setAdminToken } from '../src/stores/auth';
import { setAdminApiClient } from '../src/lib/api-client';

function mockApi(permissions: string[]) {
  return {
    login: vi.fn(),
    registerAdmin: vi.fn(),
    getRegisterOpen: vi.fn(),
    getAdminMe: vi.fn().mockResolvedValue({
      userId: 'admin_1',
      email: 'admin@test.dev',
      role: 'admin',
      permissions,
    }),
    getDashboard: vi.fn(),
    getRules: vi.fn(),
    getSubmissions: vi.fn(),
    getFunnel: vi.fn(),
    getRetention: vi.fn(),
    getPath: vi.fn(),
    getUsers: vi.fn(),
    getUser: vi.fn(),
    renewProMonth: vi.fn(),
    getAuditLogs: vi.fn(),
    recordAuditEvent: vi.fn(),
    listAdminAccounts: vi.fn(),
    createAdminAccount: vi.fn(),
    updateAdminAccount: vi.fn(),
    resetAdminAccountPassword: vi.fn(),
  };
}

describe('admin router permission guard', () => {
  beforeEach(() => {
    clearAdminToken();
  });

  it('redirects to forbidden when the admin lacks page permission', async () => {
    setAdminToken('admin-token');
    setAdminApiClient(mockApi(['analytics:read']));

    const router = createAdminRouter(createMemoryHistory());
    await router.push('/admin/users');
    await router.isReady();

    expect(router.currentRoute.value.path).toBe('/admin/forbidden');
    expect(router.currentRoute.value.query.required).toBe('users:read');
  });

  it('auditor defaults to audit logs after login redirect', async () => {
    setAdminToken('admin-token');
    setAdminApiClient(mockApi(['audit:read', 'analytics:export']));

    const router = createAdminRouter(createMemoryHistory());
    await router.push('/admin/login');
    await router.isReady();

    expect(router.currentRoute.value.path).toBe('/admin/audit-logs');
  });
});
