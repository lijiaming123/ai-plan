import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";
import bcrypt from "bcryptjs";
import type { ProAgentRunResult } from "@ai-plan/pro-plan-agent";

const mockAgentResult: ProAgentRunResult = {
  draft: {
    reply: "r",
    suggestedContent: "正文",
    schedule: {
      granularity: "day",
      slots: [
        {
          slotKey: "2026-05-11",
          content: "槽",
          generatedContent: "槽",
          contentSource: "generated",
        },
      ],
    },
    assumptions: [],
  },
  review: {
    scoreTotal: 80,
    scoreBreakdown: {
      executability: 20,
      clarity: 20,
      riskControl: 20,
      rhythm: 20,
    },
    issues: [
      {
        code: "other",
        severity: "low",
        title: "t",
        detail: "d",
        suggestion: "s",
      },
    ],
    summary: "ok",
  },
  revised: {
    suggestedContent: "正文2",
    schedule: {
      granularity: "day",
      slots: [
        {
          slotKey: "2026-05-11",
          content: "槽",
          generatedContent: "槽",
          contentSource: "generated",
        },
      ],
    },
    diffSummary: [],
  },
  options: [
    {
      id: "more_granular",
      title: "更细",
      pros: [],
      cons: [],
      promptHint: "",
    },
  ],
};

vi.mock("@ai-plan/pro-plan-agent", () => ({
  runProPlanAgent: vi.fn(async () => mockAgentResult),
}));

vi.mock("../src/lib/deepseek", () => ({
  isDeepseekConfigured: () => true,
  completeDeepseekChat: vi.fn(),
  streamDeepseekChat: async function* () {
    yield "";
  },
}));

describe("Pro 计划助手与库表 planTier", () => {
  const prevAgent = process.env.PRO_PLAN_AGENT_ENABLED;
  const prevProIds = process.env.PRO_USER_IDS;
  let app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>>;
  let token = "";
  let userId = "";
  const password = "TestPass1234!";
  let phone = "";

  beforeAll(async () => {
    delete process.env.PRO_PLAN_AGENT_ENABLED;
    process.env.PRO_USER_IDS = "";
    const { buildApp } = await import("../src/app");
    app = buildApp();
    await app.ready();

    phone = `18${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0")}`;
    const passwordHash = await bcrypt.hash(password, 6);
    const u = await prisma.user.create({
      data: { phone, passwordHash, planTier: "pro" },
      select: { id: true },
    });
    userId = u.id;

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { phone, password },
    });
    expect(login.statusCode).toBe(200);
    token = (JSON.parse(login.body) as { token: string }).token;
  }, 60000);

  afterAll(async () => {
    if (prevAgent === undefined) delete process.env.PRO_PLAN_AGENT_ENABLED;
    else process.env.PRO_PLAN_AGENT_ENABLED = prevAgent;
    if (prevProIds === undefined) delete process.env.PRO_USER_IDS;
    else process.env.PRO_USER_IDS = prevProIds;
    await prisma.userMonthlyAiUsage.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it("库表 pro 且无白名单时仍应走 Pro Agent（meta.usedAgent=pro）", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/plans/assistant",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        mode: "draft",
        goal: "Pro 门禁测试",
        requirement: "验证 planTier",
        startDate: "2026-05-11",
        cycle: "1w",
        endDate: "2026-05-17",
        tier: "pro",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { meta?: { usedAgent?: string } };
    expect(body.meta?.usedAgent).toBe("pro");
  });
});
