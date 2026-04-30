import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

describe("auth otp", () => {
  it("send -> verify -> /auth/me", async () => {
    const app = buildApp();
    await app.ready();

    const phone = "13800138000";
    // cleanup user to make test deterministic
    await prisma.user.deleteMany({ where: { phone } });

    const send = await app.inject({
      method: "POST",
      url: "/auth/otp/send",
      payload: { phone, purpose: "login" },
    });
    expect(send.statusCode).toBe(200);
    const sendBody = JSON.parse(send.body) as {
      ok: true;
      codeForTest?: string;
    };
    expect(sendBody.ok).toBe(true);
    expect(sendBody.codeForTest).toMatch(/^\d{6}$/);

    const verify = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: { phone, purpose: "login", code: sendBody.codeForTest },
    });
    expect(verify.statusCode).toBe(200);
    const verifyBody = JSON.parse(verify.body) as { token: string; phone: string };
    expect(verifyBody.phone).toBe(phone);
    expect(typeof verifyBody.token).toBe("string");

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${verifyBody.token}` },
    });
    expect(me.statusCode).toBe(200);
    const meBody = JSON.parse(me.body) as { userId: string; email: string; role: string };
    expect(meBody.role).toBe("user");
    // 兼容字段：email 暂存 phone
    expect(meBody.email).toBe(phone);

    await app.close();
  });

  it("cooldown should return 429", async () => {
    const app = buildApp();
    await app.ready();

    const phone = "13900139000";
    const a = await app.inject({
      method: "POST",
      url: "/auth/otp/send",
      payload: { phone, purpose: "login" },
    });
    expect(a.statusCode).toBe(200);

    const b = await app.inject({
      method: "POST",
      url: "/auth/otp/send",
      payload: { phone, purpose: "login" },
    });
    expect(b.statusCode).toBe(429);
    const body = JSON.parse(b.body) as { message: string; cooldownSeconds: number };
    expect(body.cooldownSeconds).toBeGreaterThan(0);

    await app.close();
  });
});

