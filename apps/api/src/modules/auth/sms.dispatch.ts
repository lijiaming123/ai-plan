/**
 * 短信发送适配层（单机/自托管）：通过环境变量选择实现，便于接入各云厂商或自建网关。
 *
 * - console：仅日志（默认；开发/演示）
 * - noop：不发送也不打日志（压测等）
 * - webhook：POST JSON 到 SMS_WEBHOOK_URL，便于自建转发服务对接具体厂商
 */
export type OtpSmsPayload = {
  phone: string;
  code: string;
  purpose: "login" | "register" | "reset";
};

export type SmsDispatchResult =
  | { ok: true }
  | { ok: false; message: string };

function normalizeProvider(): string {
  return String(process.env.SMS_PROVIDER ?? "console").trim().toLowerCase();
}

async function postWebhook(payload: OtpSmsPayload): Promise<SmsDispatchResult> {
  const url = String(process.env.SMS_WEBHOOK_URL ?? "").trim();
  if (!url) {
    return { ok: false, message: "未配置 SMS_WEBHOOK_URL" };
  }

  const timeoutMs = Math.min(
    60_000,
    Math.max(3_000, Number(process.env.SMS_WEBHOOK_TIMEOUT_MS ?? 10_000) || 10_000),
  );

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const rawExtra = process.env.SMS_WEBHOOK_HEADERS;
  if (rawExtra) {
    try {
      const parsed = JSON.parse(rawExtra) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "string") headers[k] = v;
        }
      }
    } catch {
      return { ok: false, message: "SMS_WEBHOOK_HEADERS 不是合法 JSON 对象" };
    }
  }

  const secret = process.env.SMS_WEBHOOK_SECRET;
  if (secret) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const body = JSON.stringify(payload);
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
    const hex = Buffer.from(sig).toString("hex");
    headers["X-Sms-Signature"] = `sha256=${hex}`;
  }

  const body = JSON.stringify(payload);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: ac.signal,
    });
    if (!res.ok) {
      return { ok: false, message: `短信网关返回 HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `短信发送请求失败：${msg}` };
  } finally {
    clearTimeout(t);
  }
}

/** OTP 创建成功后调用；失败时上层应删除刚写入的 AuthOtp 记录 */
export async function dispatchOtpSms(payload: OtpSmsPayload): Promise<SmsDispatchResult> {
  const provider = normalizeProvider();

  if (provider === "noop" || provider === "none") {
    return { ok: true };
  }

  if (provider === "console") {
    if (process.env.NODE_ENV !== "test") {
      console.log(
        `[sms] purpose=${payload.purpose} phone=${payload.phone} code=${payload.code}`,
      );
    }
    return { ok: true };
  }

  if (provider === "webhook") {
    return postWebhook(payload);
  }

  return { ok: false, message: `不支持的 SMS_PROVIDER：${provider}` };
}
