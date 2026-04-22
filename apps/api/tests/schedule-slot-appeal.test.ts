import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("schedule slot appeal", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("核验未通过后可提交申诉，并在 GET 计划中可见 open 申诉", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "demo@ai-plan.dev", password: "Pass1234!" },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const requirementWithJson = [
      "计划正文。",
      "```json",
      JSON.stringify({
        schedule: {
          granularity: "day",
          slots: [{ slotKey: "2026-09-01", content: "第1天任务" }],
        },
      }),
      "```",
    ].join("\n");

    const created = await app.inject({
      method: "POST",
      url: "/plans",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: "申诉测",
        deadline: "2026-09-10T00:00:00.000Z",
        requirement: requirementWithJson,
        type: "general",
        profile: {
          planMode: "basic",
          basicInfo: {
            planName: "申诉测",
            planContent: "测",
            currentLevel: "none",
            startDate: "2026-09-01",
            cycle: "custom",
            endDate: "2026-09-10",
            preference: "",
            timeInvestment: "none",
            outputMode: "daily",
            granularityMode: "deep",
          },
        },
      },
    });
    const { id: planId } = JSON.parse(created.body) as { id: string };

    await app.inject({
      method: "POST",
      url: `/plans/${planId}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: { version: 1 },
    });

    const appeal = await app.inject({
      method: "POST",
      url: `/plans/${planId}/schedule/slots/2026-09-01/appeals`,
      headers: { authorization: `Bearer ${token}` },
      payload: { content: "我认为材料已齐，请人工复核本次核验结果。" },
    });
    expect(appeal.statusCode).toBe(201);

    const detail = await app.inject({
      method: "GET",
      url: `/plans/${planId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.statusCode).toBe(200);
    const plan = JSON.parse(detail.body) as {
      scheduleSlotOpenAppeals?: Record<
        string,
        { id: string; content: string }
      >;
    };
    expect(plan.scheduleSlotOpenAppeals?.["2026-09-01"]?.content).toContain("人工");
  });

  it("可撤销进行中的申诉，GET 后不再出现 open 申诉", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "demo@ai-plan.dev", password: "Pass1234!" },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const requirementWithJson = [
      "计划正文。",
      "```json",
      JSON.stringify({
        schedule: {
          granularity: "day",
          slots: [{ slotKey: "2026-10-01", content: "slot task" }],
        },
      }),
      "```",
    ].join("\n");

    const created = await app.inject({
      method: "POST",
      url: "/plans",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: "撤诉测",
        deadline: "2026-10-20T00:00:00.000Z",
        requirement: requirementWithJson,
        type: "general",
        profile: {
          planMode: "basic",
          basicInfo: {
            planName: "撤诉测",
            planContent: "x",
            currentLevel: "none",
            startDate: "2026-10-01",
            cycle: "custom",
            endDate: "2026-10-20",
            preference: "",
            timeInvestment: "none",
            outputMode: "daily",
            granularityMode: "deep",
          },
        },
      },
    });
    const { id: planId } = JSON.parse(created.body) as { id: string };
    await app.inject({
      method: "POST",
      url: `/plans/${planId}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: { version: 1 },
    });

    const postAppeal = await app.inject({
      method: "POST",
      url: `/plans/${planId}/schedule/slots/2026-10-01/appeals`,
      headers: { authorization: `Bearer ${token}` },
      payload: { content: "先占一个申诉，稍后要撤销。" },
    });
    expect(postAppeal.statusCode).toBe(201);

    const del = await app.inject({
      method: "DELETE",
      url: `/plans/${planId}/schedule/slots/2026-10-01/appeals`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(200);
    const body = JSON.parse(del.body) as { ok?: boolean };
    expect(body.ok).toBe(true);

    const detail = await app.inject({
      method: "GET",
      url: `/plans/${planId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.statusCode).toBe(200);
    const plan = JSON.parse(detail.body) as {
      scheduleSlotOpenAppeals?: Record<string, { id: string; content: string }>;
    };
    expect(plan.scheduleSlotOpenAppeals?.["2026-10-01"]).toBeUndefined();
  });
});
