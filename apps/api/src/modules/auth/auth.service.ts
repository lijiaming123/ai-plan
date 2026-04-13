/**
 * 登录领域逻辑（演示实现）。
 *
 * authenticateUser：按邮箱查内存表 DEMO_USERS，明文比对 password；命中则返回 id/email/role，否则 null。
 * 生产替换要点：使用 bcrypt/argon2 存哈希、Prisma User 表、刷新令牌与吊销列表等；勿再提交真实密码常量。
 */
export type AuthUserRole = 'user' | 'admin';

export type LoginCredentials = {
  email: string;
  password: string;
};

export type AuthUser = {
  id: string;
  email: string;
  role: AuthUserRole;
};

/** 键为邮箱；password 仅用于演示，与 README/前端提示一致 */
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
  },
};

/** @returns 验证通过的用户摘要；密码错误或未知邮箱返回 null（由路由转 401） */
export async function authenticateUser(input: LoginCredentials): Promise<AuthUser | null> {
  const user = DEMO_USERS[input.email];
  if (!user || user.password !== input.password) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
  };
}
