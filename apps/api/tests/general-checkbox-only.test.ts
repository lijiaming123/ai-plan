import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("general checkbox-only checkin", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  async function loginToken() {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "demo@ai-plan.dev", password: "Pass1234!" },
    });
    expect(login.statusCode).toBe(200);
    return JSON.parse(login.body).token as string;
  }

  it("general: empty POST should create completion; note POST should work; attachments should be rejected; DELETE should undo", async () => {
    const token = await loginToken();

    const slotKey = "2026-06-01";
    const requirementWithJson = [
      "正文。",
      "```json",
      JSON.stringify({
        schedule: {
          granularity: "day",
          slots: [{ slotKey, content: "做一件小事" }],
        },
      }),
      "```",
    ].join("\n");

    const created = await app.inject({
      method: "POST",
      url: "/plans",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: "其它checkbox测",
        deadline: "2026-06-02T00:00:00.000Z",
        requirement: requirementWithJson,
        type: "general",
        profile: {
          planMode: "basic",
          basicInfo: {
            planScenario: "other",
            planName: "其它checkbox测",
            planContent: "x",
            currentLevel: "none",
            startDate: slotKey,
            cycle: "custom",
            endDate: "2026-06-02",
            preference: "",
            timeInvestment: "none",
            outputMode: "daily",
            granularityMode: "deep",
          },
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const { id: planId } = JSON.parse(created.body) as { id: string };

    const confirm = await app.inject({
      method: "POST",
      url: `/plans/${planId}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: { version: 1 },
    });
    expect(confirm.statusCode).toBe(200);

    const emptyPost = await app.inject({
      method: "POST",
      url: `/plans/${planId}/schedule/slots/${slotKey}/checkins`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(emptyPost.statusCode).toBe(201);

    const notePost = await app.inject({
      method: "POST",
      url: `/plans/${planId}/schedule/slots/${slotKey}/checkins`,
      headers: { authorization: `Bearer ${token}` },
      payload: { content: "今天做到了" },
    });
    expect(notePost.statusCode).toBe(201);

    const withAtt = await app.inject({
      method: "POST",
      url: `/plans/${planId}/schedule/slots/${slotKey}/checkins`,
      headers: { authorization: `Bearer ${token}` },
      payload: { attachments: [{ url: "https://example.com/a.png" }] },
    });
    expect(withAtt.statusCode).toBe(400);

    const del = await app.inject({
      method: "DELETE",
      url: `/plans/${planId}/schedule/slots/${slotKey}/checkins`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(200);
    expect(JSON.parse(del.body)).toEqual({ ok: true });

    const detailAfterDelete = await app.inject({
      method: "GET",
      url: `/plans/${planId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detailAfterDelete.statusCode).toBe(200);
    const plan = JSON.parse(detailAfterDelete.body) as {
      scheduleSlotSubmissions?: Record<string, Array<{ id: string }>>;
    };
    expect(plan.scheduleSlotSubmissions?.[slotKey] ?? []).toHaveLength(0);
  });

  it("study: DELETE /checkins should be forbidden", async () => {
    const token = await loginToken();

    const slotKey = "2026-06-10";
    const requirementWithJson = [
      "正文。",
      "```json",
      JSON.stringify({
        schedule: {
          granularity: "day",
          slots: [{ slotKey, content: "第1天任务" }],
        },
      }),
      "```",
    ].join("\n");

    const created = await app.inject({
      method: "POST",
      url: "/plans",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: "学习撤销禁用测",
        deadline: "2026-06-11T00:00:00.000Z",
        requirement: requirementWithJson,
        type: "study",
        profile: {
          planMode: "basic",
          basicInfo: {
            planScenario: "study",
            planName: "学习撤销禁用测",
            planContent: "x",
            currentLevel: "none",
            startDate: slotKey,
            cycle: "custom",
            endDate: "2026-06-11",
            preference: "",
            timeInvestment: "none",
            outputMode: "daily",
            granularityMode: "deep",
          },
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const { id: planId } = JSON.parse(created.body) as { id: string };
    await app.inject({
      method: "POST",
      url: `/plans/${planId}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: { version: 1 },
    });

    const del = await app.inject({
      method: "DELETE",
      url: `/plans/${planId}/schedule/slots/${slotKey}/checkins`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(403);
  });
});

