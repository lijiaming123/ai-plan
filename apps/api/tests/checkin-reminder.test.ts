import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { buildApp } from "../src/app";
import { runCheckinReminderJob } from "../src/modules/notifications/checkin-reminder.service";

describe("checkin reminder job", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("昨天未完成的日计划应在今天提醒窗口内补发一条站内提醒", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "demo@ai-plan.dev", password: "Pass1234!" },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    const requirementWithJson = [
      "正文",
      "```json",
      JSON.stringify({
        schedule: {
          granularity: "day",
          slots: [{ slotKey: "2026-04-23", content: "昨天该完成的任务" }],
        },
      }),
      "```",
    ].join("\n");

    const created = await app.inject({
      method: "POST",
      url: "/plans",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: "昨日漏打卡提醒测试",
        deadline: "2026-04-23T00:00:00.000Z",
        requirement: requirementWithJson,
        type: "general",
        profile: {
          planMode: "basic",
          basicInfo: {
            planName: "昨日漏打卡提醒测试",
            planContent: "测试",
            currentLevel: "none",
            startDate: "2026-04-23",
            cycle: "custom",
            endDate: "2026-04-23",
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

    await prisma.userNotificationSettings.upsert({
      where: { userId: "user_demo" },
      create: {
        userId: "user_demo",
        timeZone: "Asia/Shanghai",
        remindAtMinutes: 20 * 60,
      },
      update: {
        timeZone: "Asia/Shanghai",
        remindAtMinutes: 20 * 60,
        pendingRemindAtMinutes: null,
        switchAt: null,
      },
    });

    const before = await prisma.inAppNotification.count({
      where: {
        userId: "user_demo",
        planId,
        slotKey: "2026-04-23",
      },
    });

    await runCheckinReminderJob(new Date("2026-04-24T12:01:00.000Z"));

    const after = await prisma.inAppNotification.findMany({
      where: {
        userId: "user_demo",
        planId,
        slotKey: "2026-04-23",
      },
      orderBy: { createdAt: "desc" },
    });

    expect(after.length).toBe(before + 1);
    expect(after[0]?.body).toContain("昨日");
  });
});
