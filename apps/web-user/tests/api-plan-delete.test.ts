import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "../src/lib/api-client";

function okJson<T>(body: T): Response {
  return {
    ok: true,
    json: async () => body,
  } as unknown as Response;
}

describe("api-client plan soft-delete", () => {
  it("deletePlan 发起 DELETE 且 URL 正确", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(okJson<{ ok: true }>({ ok: true }));

    const baseURL = "https://api.example.test";
    const api = createApiClient({ baseURL, fetchImpl: fetchImpl as typeof fetch });

    await api.deletePlan({ id: "p_1", token: "t_1" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${baseURL}/plans/p_1`);
    expect(init.method).toBe("DELETE");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t_1");
  });

  it("restorePlan 发起 POST 且 URL 正确", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(okJson<{ ok: true }>({ ok: true }));

    const baseURL = "https://api.example.test";
    const api = createApiClient({ baseURL, fetchImpl: fetchImpl as typeof fetch });

    await api.restorePlan({ id: "p_2", token: "t_2" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${baseURL}/plans/p_2/restore`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t_2");
  });

  it("listDeletedPlans 发起 GET /plans/trash 且带 token", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      okJson<{ plans: Array<unknown> }>({
        plans: [],
      }),
    );

    const baseURL = "https://api.example.test";
    const api = createApiClient({ baseURL, fetchImpl: fetchImpl as typeof fetch });

    await api.listDeletedPlans({ token: "t_3" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${baseURL}/plans/trash`);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t_3");
  });
});

