import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";
import bcrypt from "bcryptjs";

vi.mock("../src/lib/deepseek", () => ({
  isDeepseekConfigured: () => true,
  streamDeepseekChat: async function* () {
    yield "";
  },
  completeDeepseekChat: vi.fn(async () => {
    return [
      "mock 正文",
      "```json",
      JSON.stringify({
        schedule: {
          granularity: "day",
          slots: [{ slotKey: "2026-05-11", content: "mock 槽" }],
        },
      }),
      "```",
    ].join("\n");
  }),
}));

describe("plan AI monthly quota", () => {
  const prevBasic = process.env.AI_QUOTA_BASIC_MONTHLY;
  let app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>>;
  let token = "";
  const password = "TestPass1234!";
  let phone = "";

  beforeAll(async () => {
    process.env.AI_QUOTA_BASIC_MONTHLY = "2";
    const { buildApp } = await import("../src/app");
    app = buildApp();
    await app.ready();

    phone = `15${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0")}`;
    const passwordHash = await bcrypt.hash(password, 6);
    await prisma.user.create({
      data: { phone, passwordHash, planTier: "basic" },
    });

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { phone, password },
    });
    expect(login.statusCode).toBe(200);
    const body = JSON.parse(login.body) as {
      token: string;
      planTier?: string;
      aiQuota?: { limit: number };
    };
    token = body.token;
    expect(body.planTier).toBe("basic");
    expect(body.aiQuota?.limit).toBe(2);
  }, 60000);

  afterAll(async () => {
    if (prevBasic === undefined) delete process.env.AI_QUOTA_BASIC_MONTHLY;
    else process.env.AI_QUOTA_BASIC_MONTHLY = prevBasic;
    const u = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (u) {
      await prisma.userMonthlyAiUsage.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    }
    await app.close();
  });

  const assistantPayload = {
    mode: "draft" as const,
    goal: "配额测试",
    requirement: "轻量测试",
    startDate: "2026-05-11",
    cycle: "1w" as const,
    endDate: "2026-05-17",
  };

  it("第三次调用 /plans/assistant 应 429 并返回 aiQuota", async () => {
    const h = { authorization: `Bearer ${token}` };
    const r1 = await app.inject({
      method: "POST",
      url: "/plans/assistant",
      headers: h,
      payload: assistantPayload,
    });
    const r2 = await app.inject({
      method: "POST",
      url: "/plans/assistant",
      headers: h,
      payload: assistantPayload,
    });
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);

    const r3 = await app.inject({
      method: "POST",
      url: "/plans/assistant",
      headers: h,
      payload: assistantPayload,
    });
    expect(r3.statusCode).toBe(429);
    const err = JSON.parse(r3.body) as {
      message: string;
      aiQuota: { used: number; limit: number };
    };
    expect(err.aiQuota.used).toBe(2);
    expect(err.aiQuota.limit).toBe(2);
    expect(err.message).toMatch(/次数/);
  });
});
