import FormData from "form-data";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

describe("schedule slot appeal", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    delete process.env.APPEAL_AI_MOCK_VERDICT;
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
    const appealBody = JSON.parse(appeal.body) as { outcome?: string };
    expect(appealBody.outcome).toBe("human_review");

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
    expect(JSON.parse(postAppeal.body).outcome).toBe("human_review");

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

  it("APPEAL_AI_MOCK_VERDICT=approve 时 AI 通过应自动建档并关闭申诉", async () => {
    vi.stubEnv("APPEAL_AI_MOCK_VERDICT", "approve");

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
          slots: [{ slotKey: "2026-11-01", content: "第1天任务" }],
        },
      }),
      "```",
    ].join("\n");

    const created = await app.inject({
      method: "POST",
      url: "/plans",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: "AI申诉通过测",
        deadline: "2026-11-10T00:00:00.000Z",
        requirement: requirementWithJson,
        type: "general",
        profile: {
          planMode: "basic",
          basicInfo: {
            planName: "AI申诉通过测",
            planContent: "x",
            currentLevel: "none",
            startDate: "2026-11-01",
            cycle: "custom",
            endDate: "2026-11-10",
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
      url: `/plans/${planId}/schedule/slots/2026-11-01/appeals`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: "材料充分，请通过。",
        proofContent: "这里是足够长的完成说明文字用于满足建档要求，并描述当日执行情况。",
        proofAttachments: [
          { url: "https://example.com/demo-proof.png", fileName: "demo.png" },
        ],
      },
    });
    expect(appeal.statusCode).toBe(201);
    const body = JSON.parse(appeal.body) as {
      outcome: string;
      submission?: { id: string };
    };
    expect(body.outcome).toBe("ai_approved");
    expect(body.submission?.id).toBeTruthy();

    const detail = await app.inject({
      method: "GET",
      url: `/plans/${planId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.statusCode).toBe(200);
    const plan = JSON.parse(detail.body) as {
      scheduleSlotOpenAppeals?: Record<string, unknown>;
      scheduleSlotSubmissions?: Record<string, Array<{ id: string }>>;
    };
    expect(plan.scheduleSlotOpenAppeals?.["2026-11-01"]).toBeUndefined();
    expect(plan.scheduleSlotSubmissions?.["2026-11-01"]?.[0]?.id).toBe(body.submission?.id);
  });

  it("人工申诉含本系统上传附件时应标记 UploadedFile.referencedBy 为 appeal 前缀", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "demo@ai-plan.dev", password: "Pass1234!" },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const form = new FormData();
    form.append("file", Buffer.from("appeal-proof"), {
      filename: "proof.png",
      contentType: "image/png",
    });
    const up = await app.inject({
      method: "POST",
      url: "/uploads",
      headers: { authorization: `Bearer ${token}`, ...form.getHeaders() },
      payload: form,
    });
    expect(up.statusCode).toBe(200);
    const upBody = JSON.parse(up.body) as { path: string };
    const storageName = upBody.path.replace("/files/", "");

    const requirementWithJson = [
      "计划正文。",
      "```json",
      JSON.stringify({
        schedule: {
          granularity: "day",
          slots: [{ slotKey: "2026-12-20", content: "申诉附件测" }],
        },
      }),
      "```",
    ].join("\n");

    const created = await app.inject({
      method: "POST",
      url: "/plans",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: "申诉附件引用测",
        deadline: "2026-12-31T00:00:00.000Z",
        requirement: requirementWithJson,
        type: "general",
        profile: {
          planMode: "basic",
          basicInfo: {
            planName: "申诉附件引用测",
            planContent: "x",
            currentLevel: "none",
            startDate: "2026-12-20",
            cycle: "custom",
            endDate: "2026-12-31",
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
      url: `/plans/${planId}/schedule/slots/2026-12-20/appeals`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: "请人工复核，证明材料已上传。",
        proofAttachments: [{ url: upBody.path, fileName: "proof.png" }],
      },
    });
    expect(appeal.statusCode).toBe(201);
    const appealBody = JSON.parse(appeal.body) as {
      outcome: string;
      appeal: { id: string };
    };
    expect(appealBody.outcome).toBe("human_review");

    const row = await (prisma as any).uploadedFile.findUnique({
      where: { storageName },
      select: { referencedAt: true, referencedBy: true },
    });
    expect(row?.referencedAt).toBeTruthy();
    expect(row?.referencedBy).toBe(`appeal:${appealBody.appeal.id}`);
  });

  it("APPEAL_AI_MOCK_VERDICT=approve 且含本系统上传附件时 referencedBy 应为 submission id", async () => {
    vi.stubEnv("APPEAL_AI_MOCK_VERDICT", "approve");

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "demo@ai-plan.dev", password: "Pass1234!" },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const form = new FormData();
    form.append("file", Buffer.from("ai-appeal-proof"), {
      filename: "p2.png",
      contentType: "image/png",
    });
    const up = await app.inject({
      method: "POST",
      url: "/uploads",
      headers: { authorization: `Bearer ${token}`, ...form.getHeaders() },
      payload: form,
    });
    expect(up.statusCode).toBe(200);
    const upBody = JSON.parse(up.body) as { path: string };
    const storageName = upBody.path.replace("/files/", "");

    const requirementWithJson = [
      "计划正文。",
      "```json",
      JSON.stringify({
        schedule: {
          granularity: "day",
          slots: [{ slotKey: "2026-12-21", content: "AI 申诉附件测" }],
        },
      }),
      "```",
    ].join("\n");

    const created = await app.inject({
      method: "POST",
      url: "/plans",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: "AI申诉附件引用测",
        deadline: "2026-12-31T00:00:00.000Z",
        requirement: requirementWithJson,
        type: "general",
        profile: {
          planMode: "basic",
          basicInfo: {
            planName: "AI申诉附件引用测",
            planContent: "x",
            currentLevel: "none",
            startDate: "2026-12-21",
            cycle: "custom",
            endDate: "2026-12-31",
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
      url: `/plans/${planId}/schedule/slots/2026-12-21/appeals`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: "材料充分，请通过。",
        proofContent:
          "这里是足够长的完成说明文字用于满足建档要求，并描述当日执行情况。",
        proofAttachments: [{ url: upBody.path, fileName: "p2.png" }],
      },
    });
    expect(appeal.statusCode).toBe(201);
    const body = JSON.parse(appeal.body) as {
      outcome: string;
      submission?: { id: string };
    };
    expect(body.outcome).toBe("ai_approved");
    expect(body.submission?.id).toBeTruthy();

    const row = await (prisma as any).uploadedFile.findUnique({
      where: { storageName },
      select: { referencedBy: true },
    });
    expect(row?.referencedBy).toBe(body.submission?.id);
  });
});
