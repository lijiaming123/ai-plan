import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("notification preferences", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET 返回默认 20:00 且可 PATCH 为次日时刻", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "demo@ai-plan.dev", password: "Pass1234!" },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const a = await app.inject({
      method: "GET",
      url: "/me/notification-preferences",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(a.statusCode).toBe(200);
    const j0 = JSON.parse(a.body) as { remindAt: string };
    expect(j0.remindAt).toBe("20:00");

    const b = await app.inject({
      method: "PATCH",
      url: "/me/notification-preferences",
      headers: { authorization: `Bearer ${token}` },
      payload: { remindAt: "21:30" },
    });
    expect(b.statusCode).toBe(200);
    const j1 = JSON.parse(b.body) as { remindAt: string; pendingRemindAt: string | null; switchAt: string | null };
    expect(j1.remindAt).toBe("20:00");
    expect(j1.pendingRemindAt).toBe("21:30");
    expect(j1.switchAt).toBeTruthy();
  });
});
