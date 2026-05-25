import bcrypt from "bcryptjs";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

describe("POST /auth/start-pro-trial", () => {
  let userId = "";
  let phone = "";
  let token = "";

  it("首次开通 7 天试用成功", async () => {
    const app = buildApp();
    await app.ready();

    phone = `16${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0")}`;
    const passwordHash = await bcrypt.hash("Pass1234!", 8);
    const u = await prisma.user.create({
      data: { phone, passwordHash, planTier: "basic" },
      select: { id: true },
    });
    userId = u.id;

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { phone, password: "Pass1234!" },
    });
    expect(login.statusCode).toBe(200);
    token = (JSON.parse(login.body) as { token: string }).token;

    const trial = await app.inject({
      method: "POST",
      url: "/auth/start-pro-trial",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(trial.statusCode).toBe(200);
    const body = JSON.parse(trial.body) as {
      planTier: string;
      proTrialUsed: boolean;
      subscriptionSource: string;
      proExpiresAt: string;
      priceCents: number;
      billingCycle: string;
    };
    expect(body.planTier).toBe("pro");
    expect(body.proTrialUsed).toBe(true);
    expect(body.subscriptionSource).toBe("trial");
    expect(body.priceCents).toBe(1900);
    expect(body.billingCycle).toBe("monthly");
    expect(body.proExpiresAt).toBeTruthy();

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    const meBody = JSON.parse(me.body) as { planTier: string; proTrialUsed: boolean };
    expect(meBody.planTier).toBe("pro");
    expect(meBody.proTrialUsed).toBe(true);

    await app.close();
  });

  it("重复试用返回 409", async () => {
    const app = buildApp();
    await app.ready();

    const again = await app.inject({
      method: "POST",
      url: "/auth/start-pro-trial",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(again.statusCode).toBe(409);
    const err = JSON.parse(again.body) as { message: string };
    expect(err.message).toBe("trial_already_used");

    await app.close();
  });

  afterAll(async () => {
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  });
});
