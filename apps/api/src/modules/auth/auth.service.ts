/**
 * 登录领域逻辑：持久化 AdminUser（bcrypt）优先，内存 DEMO_USERS 兜底（无库/本地演示）。
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { ADMIN_PERMISSIONS } from '../admin/admin-permissions';

export type AuthUserRole = 'user' | 'admin';

/** `email` 字段兼容历史 API：实为「账号或邮箱」登录标识 */
export type LoginCredentials = {
  email: string;
  password: string;
};

export type AuthUser = {
  id: string;
  email: string;
  role: AuthUserRole;
  permissions?: string[];
};

export type AdminRegisterPreset = 'analyst' | 'auditor';

/** 预置权限包（与 JWT permissions 对齐，便于运营台自助注册时选用） */
export const ADMIN_PERMISSION_PRESET = {
  /** 增长分析 + 用户列表（日常运营） */
  analyst: ['analytics:read', 'users:read'] as const,
  /** 审计日志 + 只读分析（合规/内控） */
  auditor: ['audit:read', 'analytics:read'] as const,
} as const;

const BCRYPT_COST = 12;

function normalizeLoginIdentifier(raw: string) {
  return raw.trim().toLowerCase();
}

function displayEmailForAdmin(loginId: string, email: string | null) {
  return email ?? `${loginId}@admin.local`;
}

/** 键为邮箱（小写）；password 仅用于演示 */
const DEMO_USERS: Record<string, AuthUser & { password: string }> = {
  'demo@ai-plan.dev': {
    id: 'user_demo',
    email: 'demo@ai-plan.dev',
    password: 'Pass1234!',
    role: 'user',
  },
  'admin@ai-plan.dev': {
    id: 'admin_demo',
    email: 'admin@ai-plan.dev',
    password: 'Admin1234!',
    role: 'admin',
    permissions: [...ADMIN_PERMISSIONS],
  },
  'limited-admin@ai-plan.dev': {
    id: 'admin_limited',
    email: 'limited-admin@ai-plan.dev',
    password: 'Limited1234!',
    role: 'admin',
    permissions: [],
  },
};

function resolveDemoRecord(identifier: string) {
  const key = normalizeLoginIdentifier(identifier);
  return DEMO_USERS[key];
}

async function authenticateAdminUser(identifier: string, password: string): Promise<AuthUser | null> {
  const norm = normalizeLoginIdentifier(identifier);
  if (!norm) return null;

  try {
    const row = await prisma.adminUser.findFirst({
      where: {
        OR: [{ loginId: norm }, { email: norm }],
      },
    });
    if (!row) return null;
    const ok = await bcrypt.compare(password, row.passwordHash);
    if (!ok) return null;
    const perms = row.permissions;
    const permissions = Array.isArray(perms)
      ? (perms as unknown[]).filter((p): p is string => typeof p === 'string')
      : undefined;
    return {
      id: row.id,
      email: displayEmailForAdmin(row.loginId, row.email),
      role: 'admin',
      permissions,
    };
  } catch {
    return null;
  }
}

/** @returns 验证通过的用户摘要；密码错误或未知账号返回 null（由路由转 401） */
export async function authenticateUser(input: LoginCredentials): Promise<AuthUser | null> {
  const fromDb = await authenticateAdminUser(input.email, input.password);
  if (fromDb) return fromDb;

  const demo = resolveDemoRecord(input.email);
  if (!demo || demo.password !== input.password) {
    return null;
  }

  return {
    id: demo.id,
    email: demo.email,
    role: demo.role,
    permissions: demo.permissions,
  };
}

export async function registerAdmin(input: {
  email: string;
  password: string;
  preset?: AdminRegisterPreset;
}): Promise<{ ok: true; email: string } | { ok: false; message: string }> {
  if (process.env.ADMIN_OPEN_REGISTER !== 'true') {
    return { ok: false, message: '未开放自助注册（需设置 ADMIN_OPEN_REGISTER=true）' };
  }
  const email = normalizeLoginIdentifier(input.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: '邮箱格式无效' };
  }
  if (input.password.length < 8) {
    return { ok: false, message: '密码至少 8 位' };
  }

  const preset: AdminRegisterPreset = input.preset === 'auditor' ? 'auditor' : 'analyst';
  const permissions = [...ADMIN_PERMISSION_PRESET[preset]];
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  try {
    const existing = await prisma.adminUser.findFirst({
      where: { OR: [{ loginId: email }, { email }] },
    });
    if (existing) {
      return { ok: false, message: '该邮箱已存在' };
    }

    await prisma.adminUser.create({
      data: {
        loginId: email,
        email,
        passwordHash,
        permissions,
      },
    });
    return { ok: true, email };
  } catch (e) {
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
    if (code === 'P2002') {
      return { ok: false, message: '该邮箱已存在' };
    }
    return { ok: false, message: '注册失败（请确认数据库可用且已执行迁移）' };
  }
}

/**
 * 校验忘记密码请求中的邮箱字符串（演示环境仅接受常见邮箱形态，不发送真实邮件）。
 * @returns 规范化小写邮箱，或 null 表示无效
 */
export function validateForgotPasswordEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = normalizeLoginIdentifier(raw);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (email.length > 320) return null;
  return email;
}

/** 演示环境：不落库、不发信，统一成功文案（防邮箱枚举） */
export function requestPasswordResetDemo(_emailNorm: string): {
  ok: true;
  mode: 'demo';
  message: string;
} {
  return {
    ok: true,
    mode: 'demo',
    message:
      '请求已受理。当前为演示环境，不会发送真实重置邮件；请返回登录使用演示账号，或联系管理员处理。',
  };
}
