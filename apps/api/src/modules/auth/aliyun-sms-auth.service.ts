/**
 * 阿里云「短信认证服务」（号码认证 Dypnsapi）：SendSmsVerifyCode / CheckSmsVerifyCode。
 * 使用控制台赠送签名与模板，无需企业定制资质流程。
 *
 * 配置：SMS_PROVIDER=aliyun_sms_auth，并设置 AK、赠送 SignName、TemplateCode 等。
 */
import Client from "@alicloud/dypnsapi20170525";
import {
  CheckSmsVerifyCodeRequest,
  SendSmsVerifyCodeRequest,
} from "@alicloud/dypnsapi20170525";
import { Config } from "@alicloud/openapi-core/dist/utils";

/** 写入 AuthOtp.codeHash，表示验证码由阿里云托管校验 */
export const ALIYUN_SMS_AUTH_OTP_MARKER = "ALIYUN_SMS_AUTH";

export function isAliyunSmsAuthProvider(): boolean {
  return String(process.env.SMS_PROVIDER ?? "").trim().toLowerCase() === "aliyun_sms_auth";
}

let cachedClient: Client | null = null;

function getDypnsClient(): Client | null {
  const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID?.trim();
  const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET?.trim();
  if (!accessKeyId || !accessKeySecret) return null;

  if (!cachedClient) {
    const config = new Config({
      accessKeyId,
      accessKeySecret,
      regionId: process.env.ALIYUN_DYPNS_REGION?.trim() || "cn-hangzhou",
    });
    cachedClient = new Client(config);
  }
  return cachedClient;
}

function phoneWithCountryCode(phone11: string): string {
  return phone11.startsWith("86") ? phone11 : `86${phone11}`;
}

function getTemplateParamJson(): { ok: true; json: string } | { ok: false; message: string } {
  const defaultParam = JSON.stringify({ code: "##code##", min: "5" });
  const raw =
    process.env.ALIYUN_SMS_AUTH_TEMPLATE_PARAM?.trim() || defaultParam;
  try {
    JSON.parse(raw);
    return { ok: true, json: raw };
  } catch {
    return { ok: false, message: "ALIYUN_SMS_AUTH_TEMPLATE_PARAM 不是合法 JSON" };
  }
}

function formatAliyunError(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return e instanceof Error ? e.message : String(e);
}

export async function sendAliyunSmsVerifyCode(params: {
  phone: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const client = getDypnsClient();
  if (!client) {
    return { ok: false, message: "未配置 ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET" };
  }

  const signName = process.env.ALIYUN_SMS_AUTH_SIGN_NAME?.trim();
  const templateCode = process.env.ALIYUN_SMS_AUTH_TEMPLATE_CODE?.trim();
  if (!signName || !templateCode) {
    return {
      ok: false,
      message: "未配置 ALIYUN_SMS_AUTH_SIGN_NAME 或 ALIYUN_SMS_AUTH_TEMPLATE_CODE（请使用控制台赠送签名与模板）",
    };
  }

  const tp = getTemplateParamJson();
  if (!tp.ok) return tp;

  const validTime = Math.min(
    3600,
    Math.max(60, Number(process.env.ALIYUN_SMS_AUTH_VALID_TIME_SECONDS ?? 300) || 300),
  );
  const codeLength = Math.min(
    8,
    Math.max(4, Number(process.env.ALIYUN_SMS_AUTH_CODE_LENGTH ?? 6) || 6),
  );

  const req = new SendSmsVerifyCodeRequest({
    phoneNumber: phoneWithCountryCode(params.phone),
    countryCode: "86",
    signName,
    templateCode,
    templateParam: tp.json,
    validTime,
    codeLength,
    codeType: 1,
    interval: 60,
    duplicatePolicy: 1,
    returnVerifyCode: false,
    schemeName: process.env.ALIYUN_SMS_AUTH_SCHEME_NAME?.trim() || undefined,
  });

  try {
    const res = await client.sendSmsVerifyCode(req);
    const body = res.body;
    if (body?.code === "OK" && body.success) {
      return { ok: true };
    }
    const msg = body?.message || body?.code || "短信发送失败";
    return { ok: false, message: msg };
  } catch (e) {
    return { ok: false, message: formatAliyunError(e) };
  }
}

export async function checkAliyunSmsVerifyCode(params: {
  phone: string;
  code: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const client = getDypnsClient();
  if (!client) {
    return { ok: false, message: "未配置 ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET" };
  }

  const req = new CheckSmsVerifyCodeRequest({
    phoneNumber: phoneWithCountryCode(params.phone),
    countryCode: "86",
    verifyCode: params.code,
    caseAuthPolicy: 1,
    schemeName: process.env.ALIYUN_SMS_AUTH_SCHEME_NAME?.trim() || undefined,
  });

  try {
    const res = await client.checkSmsVerifyCode(req);
    const body = res.body;
    if (body?.code !== "OK" || !body.success) {
      const msg = body?.message || body?.code || "验证码校验请求失败";
      return { ok: false, message: msg };
    }
    if (body.model?.verifyResult === "PASS") {
      return { ok: true };
    }
    return { ok: false, message: "验证码错误或已失效" };
  } catch (e) {
    return { ok: false, message: formatAliyunError(e) };
  }
}
