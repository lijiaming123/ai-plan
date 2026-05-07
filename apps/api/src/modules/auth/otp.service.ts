import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma";
import {
  ALIYUN_SMS_AUTH_OTP_MARKER,
  checkAliyunSmsVerifyCode,
  isAliyunSmsAuthProvider,
  sendAliyunSmsVerifyCode,
} from "./aliyun-sms-auth.service";
import { dispatchOtpSms } from "./sms.dispatch";

export type OtpPurpose = "login" | "register" | "reset";

const OTP_TTL_SECONDS = 5 * 60;
const OTP_COOLDOWN_SECONDS = 60;
const USER_PASSWORD_BCRYPT_COST = 12;
const USER_PASSWORD_MIN_LEN = 8;

/** 自然日（服务器本地时区）内同一手机号发送 OTP 次数上限；0 表示不限制 */
function getOtpDailyLimitPerPhone(): number {
  const raw = process.env.SMS_OTP_DAILY_LIMIT_PER_PHONE?.trim() ?? "";
  if (raw === "0") return 0;
  if (!raw) return process.env.NODE_ENV === "test" ? 0 : 20;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return process.env.NODE_ENV === "test" ? 0 : 20;
  return n;
}

/** 中国大陆 11 位手机号规范化（导出供登录路由复用） */
export function normalizePhoneCN(raw: string): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  // keep digits only
  let digits = s.replace(/[^\d+]/g, "");
  if (digits.startsWith("+86")) digits = digits.slice(3);
  digits = digits.replace(/[^\d]/g, "");
  if (!/^\d{11}$/.test(digits)) return null;
  return digits;
}

function hashOtp(params: { phone: string; code: string }) {
  const pepper = process.env.OTP_PEPPER ?? "dev-otp-pepper";
  return crypto
    .createHash("sha256")
    .update(`${params.phone}:${params.code}:${pepper}`)
    .digest("hex");
}

function generateCode(): string {
  // 6-digit numeric
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, "0");
}

export async function sendOtp(params: {
  phoneRaw: unknown;
  purposeRaw: unknown;
}): Promise<
  | {
      ok: true;
      phone: string;
      purpose: OtpPurpose;
      expiresInSeconds: number;
      cooldownSeconds: number;
      /** 仅测试环境回传，便于前端/后端测试闭环 */
      codeForTest?: string;
    }
  | { ok: false; code: 400 | 429 | 502; message: string; cooldownSeconds?: number }
> {
  const phone = normalizePhoneCN(String(params.phoneRaw ?? ""));
  if (!phone) return { ok: false, code: 400, message: "请输入有效手机号" };
  const purpose: OtpPurpose =
    params.purposeRaw === "register"
      ? "register"
      : params.purposeRaw === "reset"
        ? "reset"
        : "login";

  const now = new Date();
  const last = await prisma.authOtp.findFirst({
    where: { phone, purpose },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (last) {
    const diff = Math.floor((now.getTime() - last.createdAt.getTime()) / 1000);
    if (diff < OTP_COOLDOWN_SECONDS) {
      const cooldownSeconds = OTP_COOLDOWN_SECONDS - diff;
      return {
        ok: false,
        code: 429,
        message: `请求过于频繁，请 ${cooldownSeconds} 秒后重试`,
        cooldownSeconds,
      };
    }
  }

  const dailyLimit = getOtpDailyLimitPerPhone();
  if (dailyLimit > 0) {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const sentToday = await prisma.authOtp.count({
      where: { phone, createdAt: { gte: startOfDay } },
    });
    if (sentToday >= dailyLimit) {
      return {
        ok: false,
        code: 429,
        message: `该手机号今日获取验证码次数已达上限（${dailyLimit} 次），请明日再试或联系管理员`,
      };
    }
  }

  if (isAliyunSmsAuthProvider()) {
    const ali = await sendAliyunSmsVerifyCode({ phone });
    if (!ali.ok) {
      return {
        ok: false,
        code: 502,
        message: ali.message || "短信发送失败，请稍后重试",
      };
    }
    const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);
    await prisma.authOtp.updateMany({
      where: {
        phone,
        purpose,
        consumedAt: null,
        codeHash: ALIYUN_SMS_AUTH_OTP_MARKER,
      },
      data: { consumedAt: now },
    });
    await prisma.authOtp.create({
      data: {
        phone,
        purpose,
        codeHash: ALIYUN_SMS_AUTH_OTP_MARKER,
        expiresAt,
      },
    });
    return {
      ok: true,
      phone,
      purpose,
      expiresInSeconds: OTP_TTL_SECONDS,
      cooldownSeconds: OTP_COOLDOWN_SECONDS,
    };
  }

  const code = generateCode();
  const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);
  const row = await prisma.authOtp.create({
    data: {
      phone,
      purpose,
      codeHash: hashOtp({ phone, code }),
      expiresAt,
    },
    select: { id: true },
  });

  const sent = await dispatchOtpSms({ phone, code, purpose });
  if (!sent.ok) {
    await prisma.authOtp.delete({ where: { id: row.id } }).catch(() => undefined);
    return {
      ok: false,
      code: 502,
      message: sent.message || "短信发送失败，请稍后重试",
    };
  }

  return {
    ok: true,
    phone,
    purpose,
    expiresInSeconds: OTP_TTL_SECONDS,
    cooldownSeconds: OTP_COOLDOWN_SECONDS,
    ...(process.env.NODE_ENV === "test" ? { codeForTest: code } : {}),
  };
}

export async function verifyOtp(params: {
  phoneRaw: unknown;
  purposeRaw: unknown;
  codeRaw: unknown;
  passwordRaw?: unknown;
  passwordConfirmRaw?: unknown;
}): Promise<
  | { ok: true; userId: string; phone: string }
  | { ok: false; code: 400 | 401 | 404 | 409; message: string }
> {
  const phone = normalizePhoneCN(String(params.phoneRaw ?? ""));
  if (!phone) return { ok: false, code: 400, message: "请输入有效手机号" };
  const purpose: OtpPurpose =
    params.purposeRaw === "register"
      ? "register"
      : params.purposeRaw === "reset"
        ? "reset"
        : "login";

  const code = String(params.codeRaw ?? "").trim();

  let passwordPlain: string | null = null;
  if (purpose === "register" || purpose === "reset") {
    const p = String(params.passwordRaw ?? "");
    const c = String(params.passwordConfirmRaw ?? "");
    const label = purpose === "reset" ? "新密码" : "登录密码";
    if (!p) {
      return {
        ok: false,
        code: 400,
        message: purpose === "reset" ? "请设置新密码" : "请设置登录密码",
      };
    }
    if (p.length < USER_PASSWORD_MIN_LEN) {
      return {
        ok: false,
        code: 400,
        message: `${label}至少 ${USER_PASSWORD_MIN_LEN} 位`,
      };
    }
    if (p !== c) return { ok: false, code: 400, message: "两次输入的密码不一致" };
    passwordPlain = p;
  }

  const now = new Date();
  const record = await prisma.authOtp.findFirst({
    where: {
      phone,
      purpose,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, codeHash: true },
  });
  if (!record) return { ok: false, code: 401, message: "验证码已过期或不存在" };

  const aliyunManaged = record.codeHash === ALIYUN_SMS_AUTH_OTP_MARKER;
  const codeLen = Math.min(
    8,
    Math.max(4, Number(process.env.ALIYUN_SMS_AUTH_CODE_LENGTH ?? 6) || 6),
  );
  if (aliyunManaged) {
    if (!new RegExp(`^\\d{${codeLen}}$`).test(code)) {
      return {
        ok: false,
        code: 400,
        message: `请输入 ${codeLen} 位验证码`,
      };
    }
    const chk = await checkAliyunSmsVerifyCode({ phone, code });
    if (!chk.ok) {
      return { ok: false, code: 401, message: chk.message || "验证码错误或已失效" };
    }
  } else {
    if (!/^\d{6}$/.test(code)) {
      return { ok: false, code: 400, message: "请输入 6 位验证码" };
    }
    const ok = crypto.timingSafeEqual(
      Buffer.from(record.codeHash, "utf8"),
      Buffer.from(hashOtp({ phone, code }), "utf8"),
    );
    if (!ok) return { ok: false, code: 401, message: "验证码错误" };
  }

  if (purpose === "register" && passwordPlain) {
    const existing = await prisma.user.findUnique({
      where: { phone },
      select: { passwordHash: true },
    });
    if (existing?.passwordHash) {
      return { ok: false, code: 409, message: "该手机号已注册，请直接登录" };
    }
  }

  if (purpose === "reset" && passwordPlain) {
    const existing = await prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (!existing) {
      return { ok: false, code: 404, message: "该手机号未注册，请先注册" };
    }
  }

  await prisma.authOtp.update({
    where: { id: record.id },
    data: { consumedAt: now },
  });

  let userId: string;
  if (purpose === "register" && passwordPlain) {
    const passwordHash = await bcrypt.hash(passwordPlain, USER_PASSWORD_BCRYPT_COST);
    const user = await prisma.user.upsert({
      where: { phone },
      update: { passwordHash },
      create: { phone, passwordHash },
      select: { id: true },
    });
    userId = user.id;
  } else if (purpose === "reset" && passwordPlain) {
    const passwordHash = await bcrypt.hash(passwordPlain, USER_PASSWORD_BCRYPT_COST);
    const user = await prisma.user.update({
      where: { phone },
      data: { passwordHash },
      select: { id: true },
    });
    userId = user.id;
  } else {
    const user = await prisma.user.upsert({
      where: { phone },
      update: {},
      create: { phone },
      select: { id: true },
    });
    userId = user.id;
  }

  return { ok: true, userId, phone };
}

