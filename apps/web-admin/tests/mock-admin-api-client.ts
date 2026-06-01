import { vi } from 'vitest';
import type { AdminApiClient } from '../src/lib/api-client';

/** Vitest 用：补齐 AdminApiClient 全部方法，避免 mock 缺字段导致 typecheck 失败 */
export function createMockAdminApiClient(overrides: Partial<AdminApiClient> = {}): AdminApiClient {
  return {
    login: vi.fn(),
    registerAdmin: vi.fn(),
    getRegisterOpen: vi.fn(),
    getAdminMe: vi.fn(),
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
    ...overrides,
  };
}
