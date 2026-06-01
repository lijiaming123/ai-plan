import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import {
  normalizePermissionsInput,
  permissionsForPreset,
  type AdminAccountPresetKey,
} from './admin-account-presets';

const BCRYPT_COST = 12;

function normalizeLoginId(raw: string) {
  return raw.trim().toLowerCase();
}

export type AdminAccountListItem = {
  id: string;
  loginId: string;
  email: string | null;
  permissions: string[];
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapRow(row: {
  id: string;
  loginId: string;
  email: string | null;
  permissions: unknown;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): AdminAccountListItem {
  const perms = Array.isArray(row.permissions)
    ? row.permissions.filter((p): p is string => typeof p === 'string')
    : [];
  return {
    id: row.id,
    loginId: row.loginId,
    email: row.email,
    permissions: perms,
    disabledAt: row.disabledAt ? row.disabledAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listAdminAccounts() {
  const rows = await prisma.adminUser.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map(mapRow);
}

export async function createAdminAccount(input: {
  loginId: string;
  email?: string | null;
  password: string;
  presetKey?: AdminAccountPresetKey;
  permissions?: string[];
}) {
  const loginId = normalizeLoginId(input.loginId);
  if (!loginId || loginId.length > 64) {
    return { ok: false as const, message: 'loginId 无效' };
  }
  if (input.password.length < 8) {
    return { ok: false as const, message: '密码至少 8 位' };
  }

  let permissions: string[] | null = null;
  if (input.presetKey) {
    permissions = permissionsForPreset(input.presetKey);
  }
  if (!permissions && input.permissions) {
    permissions = normalizePermissionsInput(input.permissions);
  }
  if (!permissions || permissions.length === 0) {
    return { ok: false as const, message: '需指定 presetKey 或 permissions' };
  }

  const email =
    input.email != null && String(input.email).trim()
      ? normalizeLoginId(String(input.email))
      : null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false as const, message: '邮箱格式无效' };
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  try {
    const row = await prisma.adminUser.create({
      data: {
        loginId,
        email,
        passwordHash,
        permissions,
      },
    });
    return { ok: true as const, account: mapRow(row) };
  } catch (e) {
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
    if (code === 'P2002') {
      return { ok: false as const, message: 'loginId 或邮箱已存在' };
    }
    throw e;
  }
}

export async function updateAdminAccount(input: {
  id: string;
  actorId: string;
  email?: string | null;
  presetKey?: AdminAccountPresetKey;
  permissions?: string[];
  disabled?: boolean;
}) {
  const existing = await prisma.adminUser.findUnique({ where: { id: input.id } });
  if (!existing) {
    return { ok: false as const, message: '账号不存在' };
  }

  if (input.disabled === true && existing.id === input.actorId) {
    return { ok: false as const, message: '不能禁用当前登录账号' };
  }

  const data: {
    email?: string | null;
    permissions?: string[];
    disabledAt?: Date | null;
  } = {};

  if (input.email !== undefined) {
    const email =
      input.email != null && String(input.email).trim()
        ? normalizeLoginId(String(input.email))
        : null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false as const, message: '邮箱格式无效' };
    }
    data.email = email;
  }

  if (input.presetKey || input.permissions) {
    let permissions: string[] | null = null;
    if (input.presetKey) {
      permissions = permissionsForPreset(input.presetKey);
    }
    if (!permissions && input.permissions) {
      permissions = normalizePermissionsInput(input.permissions);
    }
    if (!permissions || permissions.length === 0) {
      return { ok: false as const, message: '权限无效' };
    }
    data.permissions = permissions;
  }

  if (input.disabled === true) {
    data.disabledAt = new Date();
  } else if (input.disabled === false) {
    data.disabledAt = null;
  }

  try {
    const row = await prisma.adminUser.update({ where: { id: input.id }, data });
    return { ok: true as const, account: mapRow(row), previous: mapRow(existing) };
  } catch (e) {
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
    if (code === 'P2002') {
      return { ok: false as const, message: '邮箱已被占用' };
    }
    throw e;
  }
}

export async function resetAdminAccountPassword(input: { id: string; newPassword: string }) {
  if (input.newPassword.length < 8) {
    return { ok: false as const, message: '密码至少 8 位' };
  }
  const existing = await prisma.adminUser.findUnique({ where: { id: input.id } });
  if (!existing) {
    return { ok: false as const, message: '账号不存在' };
  }
  const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_COST);
  await prisma.adminUser.update({ where: { id: input.id }, data: { passwordHash } });
  return { ok: true as const, loginId: existing.loginId };
}
