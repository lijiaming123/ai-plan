export const ADMIN_PERMISSIONS = [
  'analytics:read',
  'analytics:export',
  'users:read',
  'audit:read',
  'rbac:manage',
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

