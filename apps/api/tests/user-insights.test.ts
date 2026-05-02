import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { buildWeeklyTrendLocal } from "../src/modules/me/user-insights.service";

describe("buildWeeklyTrendLocal", () => {
  it("当前自然周内的提交计入数组最后一项", () => {
    const ref = new Date(2026, 3, 30, 15, 0, 0);
    const ts = [
      new Date(2026, 3, 28, 10, 0, 0),
      new Date(2026, 3, 29, 10, 0, 0),
      new Date(2026, 3, 30, 10, 0, 0),
    ];
    const out = buildWeeklyTrendLocal(ts, ref, 12);
    expect(out[11]).toBe(3);
    expect(out.reduce((a, b) => a + b, 0)).toBe(3);
  });
});

describe("GET /me/insights", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("未登录应 401", async () => {
    const res = await app.inject({ method: "GET", url: "/me/insights" });
    expect(res.statusCode).toBe(401);
  });
});
