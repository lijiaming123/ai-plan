import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "../src/lib/api-client";

function okJson<T>(body: T): Response {
  return {
    ok: true,
    json: async () => body,
  } as unknown as Response;
}

describe("api-client getUserInsights", () => {
  it("发起 GET /me/insights 且带 token", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      okJson({
        activePlans: 2,
        weekCheckinsCompleted: 1,
        avgProgressPercent: 40,
        weeklyCheckinTrend: Array.from({ length: 12 }, () => 0),
        weekRangeLabel: "4/27–5/3",
      }),
    );

    const baseURL = "https://api.example.test";
    const api = createApiClient({ baseURL, fetchImpl: fetchImpl as typeof fetch });

    const r = await api.getUserInsights({ token: "t_in" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${baseURL}/me/insights`);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t_in");
    expect(r.activePlans).toBe(2);
    expect(r.weeklyCheckinTrend).toHaveLength(12);
  });
});
