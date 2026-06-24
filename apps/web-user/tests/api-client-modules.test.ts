import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "../src/lib/api-client";

function okJson<T>(body: T): Response {
  return {
    ok: true,
    json: async () => body,
  } as unknown as Response;
}

describe("api-client modular assembly", () => {
  it("createApiClient 返回各模块预期方法", () => {
    const api = createApiClient({
      baseURL: "https://api.example.test",
      fetchImpl: vi.fn() as typeof fetch,
    });

    expect(typeof api.login).toBe("function");
    expect(typeof api.getAuthMe).toBe("function");
    expect(typeof api.getUserInsights).toBe("function");
    expect(typeof api.getPlanHeatmap).toBe("function");
    expect(typeof api.listNotifications).toBe("function");
    expect(typeof api.listPlans).toBe("function");
    expect(typeof api.createPlan).toBe("function");
    expect(typeof api.getPlan).toBe("function");
    expect(typeof api.listPresets).toBe("function");
    expect(typeof api.listMarketTemplates).toBe("function");
    expect(typeof api.uploadUserFile).toBe("function");
  });

  it("login POST /auth/login 且 JSON body", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      okJson({ token: "t_abc" }),
    );

    const baseURL = "https://api.example.test";
    const api = createApiClient({ baseURL, fetchImpl: fetchImpl as typeof fetch });

    const result = await api.login({ phone: "13800138000", password: "secret" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${baseURL}/auth/login`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(
      JSON.stringify({ phone: "13800138000", password: "secret" }),
    );
    expect(result.token).toBe("t_abc");
  });
});
