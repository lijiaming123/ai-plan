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
