import { ADMIN_PERMISSIONS } from './admin-permissions';

/** 与 web-admin `adminPresetMeta` 及 seed 对齐 */
export const ADMIN_ACCOUNT_PRESETS = {
  'super-admin': [...ADMIN_PERMISSIONS],
  analyst: ['analytics:read', 'analytics:export', 'users:read'],
  auditor: ['audit:read', 'analytics:export'],
} as const;

export type AdminAccountPresetKey = keyof typeof ADMIN_ACCOUNT_PRESETS;

export function permissionsForPreset(presetKey: string): string[] | null {
  if (presetKey in ADMIN_ACCOUNT_PRESETS) {
    return [...ADMIN_ACCOUNT_PRESETS[presetKey as AdminAccountPresetKey]];
  }
  return null;
}

export function normalizePermissionsInput(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw.filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
  return out.length ? out : null;
}
