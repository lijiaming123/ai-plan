import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import bcrypt from "bcryptjs";

describe("admin PATCH /admin/users/:userId/plan-tier", () => {
  const app = buildApp();
  let adminToken = "";
  let limitedToken = "";
  let appUserId = "";
  let phone = "";
  const password = "TestPass1234!";

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

    phone = `17${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0")}`;
    const passwordHash = await bcrypt.hash(password, 6);
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
      method: "PATCH",
      url: `/admin/users/${appUserId}/plan-tier`,
      headers: { authorization: `Bearer ${limitedToken}` },
      payload: { planTier: "pro" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("管理员应能开通 pro 并写入审计", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/users/${appUserId}/plan-tier`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { planTier: "pro", proExpiresAt: "2099-01-01T00:00:00.000Z" },
    });
    expect(res.statusCode).toBe(200);

    const row = await prisma.user.findUnique({
      where: { id: appUserId },
      select: { planTier: true, proExpiresAt: true },
    });
    expect(row?.planTier).toBe("pro");
    expect(row?.proExpiresAt).toBeTruthy();

    const logs = await prisma.auditLog.findMany({
      where: { targetId: appUserId, action: "user.plan_tier" },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    expect(logs.length).toBe(1);
  });

  it("GET /admin/users/:id 应含 planTier（仅 App 用户无业务活动也应可查询）", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/users/${appUserId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { planTier: string | null; phone: string | null };
    expect(body.planTier).toBe("pro");
    expect(body.phone).toBe(phone);
  });
});
