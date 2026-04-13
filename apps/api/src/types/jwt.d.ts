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
    };
    user: {
      sub: string;
      email: string;
      role: 'user' | 'admin';
    };
  }
}
