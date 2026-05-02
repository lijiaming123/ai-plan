import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchOtpSms } from "../src/modules/auth/sms.dispatch";

describe("dispatchOtpSms", () => {
  const fetchMock = vi.fn();
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = originalFetch;
    fetchMock.mockReset();
  });

  it("webhook：成功时返回 ok", async () => {
    vi.stubEnv("SMS_PROVIDER", "webhook");
    vi.stubEnv("SMS_WEBHOOK_URL", "https://example.test/sms");
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const r = await dispatchOtpSms({
      phone: "13800138000",
      code: "123456",
      purpose: "login",
    });
    expect(r).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      phone: "13800138000",
      code: "123456",
      purpose: "login",
    });
  });

  it("webhook：未配置 URL 返回失败", async () => {
    vi.stubEnv("SMS_PROVIDER", "webhook");
    vi.stubEnv("SMS_WEBHOOK_URL", "");
    const r = await dispatchOtpSms({
      phone: "13800138000",
      code: "123456",
      purpose: "login",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("SMS_WEBHOOK_URL");
  });

  it("未知 provider 返回失败", async () => {
    vi.stubEnv("SMS_PROVIDER", "unknown-vendor");
    const r = await dispatchOtpSms({
      phone: "13800138000",
      code: "123456",
      purpose: "login",
    });
    expect(r.ok).toBe(false);
  });
});
