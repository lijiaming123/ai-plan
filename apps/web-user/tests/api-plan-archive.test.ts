import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "../src/lib/api-client";

function okJson<T>(body: T): Response {
  return {
    ok: true,
    json: async () => body,
  } as unknown as Response;
}

describe("api-client plan archive", () => {
  it("listArchivedPlans 发起 GET /plans/archive 且带 token、分页参数", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      okJson<{ plans: Array<unknown>; hasMore: boolean }>({
        plans: [],
        hasMore: false,
      }),
    );

    const baseURL = "https://api.example.test";
    const api = createApiClient({ baseURL, fetchImpl: fetchImpl as typeof fetch });

    await api.listArchivedPlans({ token: "t_a" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${baseURL}/plans/archive?limit=20&offset=0`);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t_a");
  });

  it("archivePlan 发起 POST /plans/:id/archive", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(okJson<{ ok: true }>({ ok: true }));

    const baseURL = "https://api.example.test";
    const api = createApiClient({ baseURL, fetchImpl: fetchImpl as typeof fetch });

    await api.archivePlan({ id: "p_arc", token: "t_b" });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${baseURL}/plans/p_arc/archive`);
    expect(init.method).toBe("POST");
  });

  it("unarchivePlan 发起 POST /plans/:id/unarchive", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(okJson<{ ok: true }>({ ok: true }));

    const baseURL = "https://api.example.test";
    const api = createApiClient({ baseURL, fetchImpl: fetchImpl as typeof fetch });

    await api.unarchivePlan({ id: "p_arc2", token: "t_c" });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${baseURL}/plans/p_arc2/unarchive`);
    expect(init.method).toBe("POST");
  });
});
