/**
 * @fastify/jwt 模块增强：约定 decode 后的 payload 与 `request.user` 形状。
 * 登录时 `jwt.sign({ sub, email, role })` 写入；路由里 `jwtVerify` 推断出的字段与此一致。
 */
import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      email: string;
      role: 'user' | 'admin';
      /**
       * 管理端权限点（RBAC v1）：仅 admin token 可能携带。
       * - 为空：视为无权限（用于测试/最小授权）
       * - 未提供（undefined）：兼容旧 token；服务端将按“默认 admin 权限集”兜底
       */
      permissions?: string[];
    };
    user: {
      sub: string;
      email: string;
      role: 'user' | 'admin';
      permissions?: string[];
    };
  }
}
