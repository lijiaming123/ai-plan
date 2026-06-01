import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import {
  buildPlanAssistantMemoryBlock,
  validatePlanAssistantProfilePatch,
} from "../src/modules/me/plan-assistant-context.service";

/** Prisma Client 需已 `prisma generate`，否则 Windows 上常见 EPERM 导致 delegate 缺失 */
function prismaPlanAssistantReady(): boolean {
  return (
    typeof (
      prisma as unknown as { userPlanAssistantProfile?: { findUnique: unknown } }
    ).userPlanAssistantProfile?.findUnique === "function"
  );
}

let userPlanAssistantTableReady = false;
if (prismaPlanAssistantReady()) {
  try {
    await prisma.$queryRaw`SELECT 1 FROM "UserPlanAssistantProfile" LIMIT 1`;
    userPlanAssistantTableReady = true;
  } catch {
    userPlanAssistantTableReady = false;
  }
}

describe("validatePlanAssistantProfilePatch", () => {
  it("拒绝非法 tone", () => {
    const r = validatePlanAssistantProfilePatch({ tone: "verbose" });
    expect(r.ok).toBe(false);
  });

  it("接受 concise 与 null", () => {
    const a = validatePlanAssistantProfilePatch({ tone: "concise" });
    expect(a.ok).toBe(true);
    const b = validatePlanAssistantProfilePatch({ tone: null });
    expect(b.ok).toBe(true);
  });
});

describe("plan assistant memory API — 鉴权", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("未登录 GET 应 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/me/plan-assistant-context",
    });
    expect(res.statusCode).toBe(401);
  });

  it("管理员 GET 应 403", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@ai-plan.dev", password: "Admin1234!" },
    });
    expect(login.statusCode).toBe(200);
    const { token } = JSON.parse(login.body) as { token: string };
    const res = await app.inject({
      method: "GET",
      url: "/me/plan-assistant-context",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe.skipIf(!prismaPlanAssistantReady() || !userPlanAssistantTableReady)(
  "plan assistant memory API — 需迁移表",
  () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
    /** 演示 JWT sub=user_demo 默认无 User 行；补一行以便 /me/plan-assistant-* 走库 */
    await prisma.user.upsert({
      where: { id: "user_demo" },
      create: { id: "user_demo", phone: "19900008888" },
      update: {},
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("普通用户 GET 返回 profile 与摘要长度上限", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "demo@ai-plan.dev", password: "Pass1234!" },
    });
    expect(login.statusCode).toBe(200);
    const { token } = JSON.parse(login.body) as { token: string };
    const res = await app.inject({
      method: "GET",
      url: "/me/plan-assistant-context",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const j = JSON.parse(res.body) as {
      profile: { language: string | null; pinnedNotes: string[] };
      completionSummary: string;
    };
    expect(j.profile.language).toBe("zh");
    expect(Array.isArray(j.profile.pinnedNotes)).toBe(true);
    expect(j.completionSummary.length).toBeGreaterThan(0);
    expect(j.completionSummary.length).toBeLessThanOrEqual(400);
  });

  it("PATCH 非法字段 400；合法 PATCH 后 GET 一致", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "demo@ai-plan.dev", password: "Pass1234!" },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const bad = await app.inject({
      method: "PATCH",
      url: "/me/plan-assistant-profile",
      headers: { authorization: `Bearer ${token}` },
      payload: { tone: "invalid" },
    });
    expect(bad.statusCode).toBe(400);

    const ok = await app.inject({
      method: "PATCH",
      url: "/me/plan-assistant-profile",
      headers: { authorization: `Bearer ${token}` },
      payload: { tone: "concise", defaultScenario: "study" },
    });
    expect(ok.statusCode).toBe(200);
    const j = JSON.parse(ok.body) as { profile: { tone: string | null } };
    expect(j.profile.tone).toBe("concise");

    const again = await app.inject({
      method: "GET",
      url: "/me/plan-assistant-context",
      headers: { authorization: `Bearer ${token}` },
    });
    const j2 = JSON.parse(again.body) as { profile: { tone: string | null } };
    expect(j2.profile.tone).toBe("concise");
  });

  it("POST pin-note 空文本 400；写入后出现在 profile", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "demo@ai-plan.dev", password: "Pass1234!" },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const empty = await app.inject({
      method: "POST",
      url: "/me/plan-assistant-profile/pin-note",
      headers: { authorization: `Bearer ${token}` },
      payload: { text: "   " },
    });
    expect(empty.statusCode).toBe(400);

    const pin = `测试记住一句 ${Date.now()}`;
    const ok = await app.inject({
      method: "POST",
      url: "/me/plan-assistant-profile/pin-note",
      headers: { authorization: `Bearer ${token}` },
      payload: { text: pin },
    });
    expect(ok.statusCode).toBe(200);
    const j = JSON.parse(ok.body) as { profile: { pinnedNotes: string[] } };
    expect(j.profile.pinnedNotes).toContain(pin);
  });

  it("buildPlanAssistantMemoryBlock 非空且长度受控", async () => {
    const block = await buildPlanAssistantMemoryBlock("user_demo");
    expect(block.length).toBeGreaterThan(0);
    expect(block.length).toBeLessThanOrEqual(1800);
  });
});
