import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticateUser } from "../src/modules/auth/auth.service";

describe("authenticateUser 普通用户密码门禁", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("生产环境禁止演示普通用户邮箱密码", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_DEMO_PASSWORD_USER", "");
    const u = await authenticateUser({
      email: "demo@ai-plan.dev",
      password: "Pass1234!",
    });
    expect(u).toBeNull();
  });

  it("生产环境 AUTH_DEMO_PASSWORD_USER=true 时允许演示普通用户", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_DEMO_PASSWORD_USER", "true");
    const u = await authenticateUser({
      email: "demo@ai-plan.dev",
      password: "Pass1234!",
    });
    expect(u?.email).toBe("demo@ai-plan.dev");
    expect(u?.role).toBe("user");
  });

  it("生产环境仍允许演示管理员邮箱密码", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_DEMO_PASSWORD_USER", "");
    const u = await authenticateUser({
      email: "admin@ai-plan.dev",
      password: "Admin1234!",
    });
    expect(u?.role).toBe("admin");
  });
});
