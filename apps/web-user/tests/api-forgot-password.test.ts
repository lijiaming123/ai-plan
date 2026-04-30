import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "../src/lib/api-client";

function okJson<T>(body: T): Response {
  return {
    ok: true,
    json: async () => body,
  } as unknown as Response;
}

describe("api-client forgotPassword", () => {
  it("POST /auth/forgot-password 且 JSON body", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      okJson({
        ok: true,
        mode: "demo",
        message: "ok",
      }),
    );

    const baseURL = "https://api.example.test";
    const api = createApiClient({ baseURL, fetchImpl: fetchImpl as typeof fetch });

    await api.forgotPassword({ email: "u@x.dev" });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${baseURL}/auth/forgot-password`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ email: "u@x.dev" }));
  });
});
