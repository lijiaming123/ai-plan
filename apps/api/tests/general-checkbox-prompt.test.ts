import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let lastDeepseekMessages:
  | Array<{ role: "system" | "user" | "assistant"; content: string }>
  | null = null;

vi.mock("../src/lib/deepseek", () => {
  return {
    isDeepseekConfigured: () => true,
    streamDeepseekChat: async function* () {
      // 本测试不覆盖 stream 路径
    },
    completeDeepseekChat: vi.fn(
      async (
        messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
      ) => {
        lastDeepseekMessages = messages;
        const user = messages.find((m) => m.role === "user")?.content ?? "";
        const generalOn =
          user.includes("轻量清单输出要求") ||
          user.includes("checkbox-only") ||
          user.includes("最小行动");
        const slotContent = generalOn ? "最小行动：喝一杯水；可选：散步10分钟。" : "本期计划：完成1个可验证动作。";
        return [
          "正文（mock）",
          "```json",
          JSON.stringify({
            schedule: {
              granularity: "day",
              slots: [{ slotKey: "2026-04-10", content: slotContent }],
            },
          }),
          "```",
        ].join("\n");
      },
    ),
  };
});

describe("general prompt branch", () => {
  let app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>> | null =
    null;

  beforeAll(async () => {
    const { buildApp } = await import("../src/app");
    app = buildApp();
    await app.ready();
  }, 30000);

  afterAll(async () => {
    await app?.close();
    app = null;
  });

  it("assistant draft: other/general should use lightweight checklist prompt", async () => {
    if (!app) throw new Error("app not ready");
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "demo@ai-plan.dev", password: "Pass1234!" },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const res = await app.inject({
      method: "POST",
      url: "/plans/assistant",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        mode: "draft",
        goal: "每天喝水",
        requirement: "场景：other\ntype=general\n我只想做一个轻量清单，完成方式勾选即可，允许备注。",
        startDate: "2026-04-10",
        cycle: "custom",
        endDate: "2026-04-10",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      schedule?: { slots?: Array<{ content: string }> };
    };
    const content = body.schedule?.slots?.[0]?.content ?? "";
    expect(content).toMatch(/最小行动|清单|勾选|备注|喝水/);

    expect(lastDeepseekMessages?.[0]?.role).toBe("system");
    expect(lastDeepseekMessages?.[0]?.content).toMatch(/轻量行动清单教练/);
  });
});

