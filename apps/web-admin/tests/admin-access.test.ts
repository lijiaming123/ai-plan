import { adminPresetMeta, getDefaultAdminPath, resolveAdminRolePreset } from '../src/lib/admin-access';

describe('admin role landing', () => {
  it('auditor preset has no analytics:read', () => {
    const auditor = adminPresetMeta.find((p) => p.key === 'auditor')!;
    expect(auditor.permissions).not.toContain('analytics:read');
    expect(auditor.permissions).toContain('audit:read');
    expect(auditor.permissions).toContain('analytics:export');
  });

  it('analyst preset includes export', () => {
    const analyst = adminPresetMeta.find((p) => p.key === 'analyst')!;
    expect(analyst.permissions).toContain('analytics:read');
    expect(analyst.permissions).toContain('analytics:export');
    expect(analyst.permissions).toContain('users:read');
  });

  it('auditor lands on audit-logs', () => {
    const perms = ['audit:read', 'analytics:export'];
    expect(getDefaultAdminPath(perms)).toBe('/admin/audit-logs');
    expect(resolveAdminRolePreset(perms)).toBe('auditor');
  });

  it('analyst lands on dashboard', () => {
    const perms = ['analytics:read', 'users:read', 'analytics:export'];
    expect(getDefaultAdminPath(perms)).toBe('/admin/dashboard');
    expect(resolveAdminRolePreset(perms)).toBe('analyst');
  });
});
