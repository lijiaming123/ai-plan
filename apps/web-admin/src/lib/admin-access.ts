import type { AdminPermission } from './api-client';

export type AdminNavIcon =
  | 'dashboard'
  | 'funnel'
  | 'retention'
  | 'path'
  | 'users'
  | 'rules'
  | 'submissions'
  | 'audit'
  | 'access'
  | 'admin-users';

export type AdminRolePresetKey = 'super-admin' | 'analyst' | 'auditor' | 'custom';

export type AdminNavItem = {
  label: string;
  to: string;
  icon?: AdminNavIcon;
  permission?: AdminPermission;
};

export const adminPermissionMeta: Record<
  AdminPermission,
  { label: string; description: string }
> = {
  'analytics:read': {
    label: '分析查看',
    description: '查看总览、漏斗、留存、路径、规则和提交流水。',
  },
  'analytics:export': {
    label: '分析导出',
    description: '导出分析明细与审计列表。',
  },
  'users:read': {
    label: '用户查看',
    description: '访问业务用户列表与用户详情画像。',
  },
  'users:write': {
    label: '用户治理',
    description: '调整业务用户会员档位与续期。',
  },
  'audit:read': {
    label: '审计查看',
    description: '查看治理相关的审计记录与合规留痕。',
  },
  'rbac:manage': {
    label: '权限管理',
    description: '管理管理员角色包与后台授权策略。',
  },
};

export const adminPresetMeta = [
  {
    key: 'super-admin' as const,
    label: '超级管理员',
    description: '拥有全量后台能力，适合平台负责人或值班管理员。',
    permissions: Object.keys(adminPermissionMeta) as AdminPermission[],
  },
  {
    key: 'analyst' as const,
    label: '运营分析',
    description: '关注增长与用户画像，可查看分析报表、导出并访问业务用户。',
    permissions: ['analytics:read', 'analytics:export', 'users:read'] as AdminPermission[],
  },
  {
    key: 'auditor' as const,
    label: '审计只读',
    description: '以审计工作台为主，可查看合规留痕并导出审计记录。',
    permissions: ['audit:read', 'analytics:export'] as AdminPermission[],
  },
] as const;

export function permissionsMatchPreset(
  permissions: readonly string[],
  presetKey: AdminRolePresetKey,
): boolean {
  const preset = adminPresetMeta.find((p) => p.key === presetKey);
  if (!preset) return false;
  const a = [...permissions].sort().join('|');
  const b = [...preset.permissions].sort().join('|');
  return a === b;
}

export function resolveAdminRolePreset(permissions: readonly string[]): AdminRolePresetKey {
  for (const preset of adminPresetMeta) {
    if (permissionsMatchPreset(permissions, preset.key)) {
      return preset.key;
    }
  }
  return 'custom';
}

export const adminPageMatrix = [
  {
    title: '总览与分析',
    to: '/admin/dashboard',
    permission: 'analytics:read' as AdminPermission,
    description: '仪表盘、漏斗、留存、路径分析。',
  },
  {
    title: '用户管理',
    to: '/admin/users',
    permission: 'users:read' as AdminPermission,
    description: '业务用户列表、画像和行为明细。',
  },
  {
    title: '审计日志',
    to: '/admin/audit-logs',
    permission: 'audit:read' as AdminPermission,
    description: '合规留痕与高风险动作检索。',
  },
  {
    title: '管理员账号',
    to: '/admin/admin-users',
    permission: 'rbac:manage' as AdminPermission,
    description: '创建后台账号、分配角色包与禁用治理。',
  },
  {
    title: '角色权限',
    to: '/admin/access',
    permission: undefined,
    description: '当前账号权限总览、角色包说明与访问矩阵。',
  },
];

export const adminNavItems: readonly AdminNavItem[] = [
  { label: '总览', to: '/admin/dashboard', icon: 'dashboard', permission: 'analytics:read' as AdminPermission },
  { label: '漏斗', to: '/admin/analytics/funnel', icon: 'funnel', permission: 'analytics:read' as AdminPermission },
  {
    label: '留存',
    to: '/admin/analytics/retention',
    icon: 'retention',
    permission: 'analytics:read' as AdminPermission,
  },
  { label: '路径', to: '/admin/analytics/path', icon: 'path', permission: 'analytics:read' as AdminPermission },
  { label: '用户', to: '/admin/users', icon: 'users', permission: 'users:read' as AdminPermission },
  { label: '规则', to: '/admin/rules', icon: 'rules', permission: 'analytics:read' as AdminPermission },
  {
    label: '提交',
    to: '/admin/submissions',
    icon: 'submissions',
    permission: 'analytics:read' as AdminPermission,
  },
  { label: '审计', to: '/admin/audit-logs', icon: 'audit', permission: 'audit:read' as AdminPermission },
  {
    label: '管理员',
    to: '/admin/admin-users',
    icon: 'admin-users',
    permission: 'rbac:manage' as AdminPermission,
  },
  { label: '权限', to: '/admin/access', icon: 'access', permission: undefined },
];

export function hasAdminPermission(
  permissions: readonly string[],
  permission?: AdminPermission,
): boolean {
  if (!permission) return true;
  return permissions.includes(permission);
}

export function getAdminPermissionLabel(permission: AdminPermission) {
  return adminPermissionMeta[permission].label;
}

export function getAdminRoleLabel(permissions: readonly string[]) {
  const preset = resolveAdminRolePreset(permissions);
  if (preset === 'super-admin') return '超级管理员';
  if (preset === 'analyst') return '运营分析';
  if (preset === 'auditor') return '审计只读';

  const effective = new Set(permissions);
  if (effective.has('rbac:manage')) return '超级管理员';
  if (effective.has('users:read') && effective.has('analytics:read')) return '运营分析';
  if (effective.has('audit:read')) return '审计只读';
  if (effective.size === 0) return '受限账号';
  return '自定义角色';
}

export function getDefaultAdminPath(permissions: readonly string[]) {
  const preset = resolveAdminRolePreset(permissions);
  if (preset === 'auditor') return '/admin/audit-logs';
  if (hasAdminPermission(permissions, 'analytics:read')) return '/admin/dashboard';
  if (hasAdminPermission(permissions, 'audit:read')) return '/admin/audit-logs';
  if (hasAdminPermission(permissions, 'users:read')) return '/admin/users';
  return '/admin/access';
}
