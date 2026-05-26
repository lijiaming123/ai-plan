import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import bcrypt from "bcryptjs";
import { addNaturalMonth } from "../src/modules/billing/natural-month";

describe("admin POST /admin/users/:userId/renew-pro-month", () => {
  const app = buildApp();
  let adminToken = "";
  let limitedToken = "";
  let appUserId = "";
  let phone = "";

  beforeAll(async () => {
    await app.ready();
    const a = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@ai-plan.dev", password: "Admin1234!" },
    });
    adminToken = (JSON.parse(a.body) as { token: string }).token;
    const l = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "limited-admin@ai-plan.dev", password: "Limited1234!" },
    });
    limitedToken = (JSON.parse(l.body) as { token: string }).token;

    phone = `18${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0")}`;
    const passwordHash = await bcrypt.hash("TestPass1234!", 6);
    const u = await prisma.user.create({
      data: { phone, passwordHash, planTier: "basic" },
      select: { id: true },
    });
    appUserId = u.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: appUserId } });
    await app.close();
  });

  it("无 users:write 应 403", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/users/${appUserId}/renew-pro-month`,
      headers: { authorization: `Bearer ${limitedToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("应从今日起续期 1 自然月并标记 paid", async () => {
    const before = new Date();
    const res = await app.inject({
      method: "POST",
      url: `/admin/users/${appUserId}/renew-pro-month`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      ok: boolean;
      planTier: string;
      proExpiresAt: string;
      proSubscriptionSource: string;
    };
    expect(body.ok).toBe(true);
    expect(body.planTier).toBe("pro");
    expect(body.proSubscriptionSource).toBe("paid");

    const expected = addNaturalMonth(before).toISOString();
    expect(body.proExpiresAt).toBe(expected);

    const row = await prisma.user.findUnique({
      where: { id: appUserId },
      select: { planTier: true, proExpiresAt: true, proSubscriptionSource: true },
    });
    expect(row?.planTier).toBe("pro");
    expect(row?.proSubscriptionSource).toBe("paid");
    expect(row?.proExpiresAt?.toISOString()).toBe(expected);
  });

  it("未过期再次续期应在原到期日上叠加", async () => {
    const row = await prisma.user.findUnique({
      where: { id: appUserId },
      select: { proExpiresAt: true },
    });
    const current = row!.proExpiresAt!;
    const res = await app.inject({
      method: "POST",
      url: `/admin/users/${appUserId}/renew-pro-month`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { proExpiresAt: string };
    expect(body.proExpiresAt).toBe(addNaturalMonth(current).toISOString());
  });
});
