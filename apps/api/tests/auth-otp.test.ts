import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { peekCaptchaAnswerForTest } from "../src/modules/auth/captcha.service";

async function postOtpSend(
  app: ReturnType<typeof buildApp>,
  payload: { phone: string; purpose: string },
) {
  const cap = await app.inject({ method: "GET", url: "/auth/captcha" });
  expect(cap.statusCode).toBe(200);
  const { captchaId } = JSON.parse(cap.body) as { captchaId: string };
  const ans = peekCaptchaAnswerForTest(captchaId);
  expect(ans).toBeDefined();
  return app.inject({
    method: "POST",
    url: "/auth/otp/send",
    payload: { ...payload, captchaId, captchaText: ans },
  });
}

async function cleanupOtpPhone(phone: string) {
  await prisma.authOtp.deleteMany({ where: { phone } });
  await prisma.user.deleteMany({ where: { phone } });
}

describe("auth otp", () => {
  it("send -> verify -> /auth/me", async () => {
    const app = buildApp();
    await app.ready();

    const phone = "13800138000";
    await cleanupOtpPhone(phone);

    const send = await postOtpSend(app, { phone, purpose: "login" });
    expect(send.statusCode).toBe(200);
    const sendBody = JSON.parse(send.body) as {
      ok: true;
      codeForTest?: string;
    };
    expect(sendBody.ok).toBe(true);
    expect(sendBody.codeForTest).toMatch(/^\d{6}$/);

    const verify = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: { phone, purpose: "login", code: sendBody.codeForTest },
    });
    expect(verify.statusCode).toBe(200);
    const verifyBody = JSON.parse(verify.body) as { token: string; phone: string };
    expect(verifyBody.phone).toBe(phone);
    expect(typeof verifyBody.token).toBe("string");

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${verifyBody.token}` },
    });
    expect(me.statusCode).toBe(200);
    const meBody = JSON.parse(me.body) as { userId: string; email: string; role: string };
    expect(meBody.role).toBe("user");
    // 兼容字段：email 暂存 phone
    expect(meBody.email).toBe(phone);

    await app.close();
  });

  it("注册需密码：校验通过后可用手机号密码登录", async () => {
    const app = buildApp();
    await app.ready();

    const phone = "13711110001";
    await cleanupOtpPhone(phone);

    const send = await postOtpSend(app, { phone, purpose: "register" });
    expect(send.statusCode).toBe(200);
    const sendBody = JSON.parse(send.body) as { ok: true; codeForTest?: string };
    expect(sendBody.codeForTest).toMatch(/^\d{6}$/);

    const verify = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: {
        phone,
        purpose: "register",
        code: sendBody.codeForTest,
        password: "SecureP1!",
        passwordConfirm: "SecureP1!",
      },
    });
    expect(verify.statusCode).toBe(200);

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { phone, password: "SecureP1!" },
    });
    expect(login.statusCode).toBe(200);
    expect(JSON.parse(login.body).token).toBeTypeOf("string");

    await app.close();
  });

  it("注册未带密码应 400", async () => {
    const app = buildApp();
    await app.ready();
    const phone = "13711110002";
    await cleanupOtpPhone(phone);

    const send = await postOtpSend(app, { phone, purpose: "register" });
    expect(send.statusCode).toBe(200);
    const sendBody = JSON.parse(send.body) as { codeForTest?: string };

    const verify = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: { phone, purpose: "register", code: sendBody.codeForTest },
    });
    expect(verify.statusCode).toBe(400);

    await app.close();
  });

  it("已注册手机号再次注册应 409", async () => {
    const app = buildApp();
    await app.ready();
    const phone = "13711110003";
    await cleanupOtpPhone(phone);

    const send1 = await postOtpSend(app, { phone, purpose: "register" });
    const b1 = JSON.parse(send1.body) as { codeForTest?: string };
    await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: {
        phone,
        purpose: "register",
        code: b1.codeForTest,
        password: "SecureP1!",
        passwordConfirm: "SecureP1!",
      },
    });

    // 已注册场景的再次注册校验：避免被上一次发送触发的 cooldown 影响
    await prisma.authOtp.deleteMany({ where: { phone, purpose: "register" } });
    const send2 = await postOtpSend(app, { phone, purpose: "register" });
    expect(send2.statusCode).toBe(200);
    const b2 = JSON.parse(send2.body) as { codeForTest?: string };
    const verify2 = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: {
        phone,
        purpose: "register",
        code: b2.codeForTest,
        password: "OtherP2!!",
        passwordConfirm: "OtherP2!!",
      },
    });
    expect(verify2.statusCode).toBe(409);

    await app.close();
  });

  it(
    "找回密码：验证码 + 新密码 后可用新密码登录",
    async () => {
    const app = buildApp();
    await app.ready();
    const phone = "13722220001";
    await cleanupOtpPhone(phone);
    await prisma.user.create({
      data: {
        phone,
        passwordHash: await bcrypt.hash("OldPass1!", 12),
      },
    });

    const send = await postOtpSend(app, { phone, purpose: "reset" });
    expect(send.statusCode).toBe(200);
    const sendBody = JSON.parse(send.body) as { codeForTest?: string };

    const verify = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: {
        phone,
        purpose: "reset",
        code: sendBody.codeForTest,
        password: "NewPass2!",
        passwordConfirm: "NewPass2!",
      },
    });
    expect(verify.statusCode).toBe(200);

    const loginOld = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { phone, password: "OldPass1!" },
    });
    expect(loginOld.statusCode).toBe(401);

    const loginNew = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { phone, password: "NewPass2!" },
    });
    expect(loginNew.statusCode).toBe(200);

    await app.close();
    },
    15000,
  );

  it("找回密码：未注册手机号应 404", async () => {
    const app = buildApp();
    await app.ready();
    const phone = "13722220002";
    await cleanupOtpPhone(phone);

    const send = await postOtpSend(app, { phone, purpose: "reset" });
    expect(send.statusCode).toBe(200);
    const sendBody = JSON.parse(send.body) as { codeForTest?: string };

    const verify = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: {
        phone,
        purpose: "reset",
        code: sendBody.codeForTest,
        password: "NewPass2!",
        passwordConfirm: "NewPass2!",
      },
    });
    expect(verify.statusCode).toBe(404);

    await app.close();
  });

  it("cooldown should return 429", async () => {
    const app = buildApp();
    await app.ready();

    const phone = "13900139000";
    await cleanupOtpPhone(phone);
    const a = await postOtpSend(app, { phone, purpose: "login" });
    expect(a.statusCode).toBe(200);

    const b = await postOtpSend(app, { phone, purpose: "login" });
    expect(b.statusCode).toBe(429);
    const body = JSON.parse(b.body) as { message: string; cooldownSeconds: number };
    expect(body.cooldownSeconds).toBeGreaterThan(0);

    await app.close();
  });

  it("otp send 缺少或错误图形验证码应 400", async () => {
    const app = buildApp();
    await app.ready();

    const missing = await app.inject({
      method: "POST",
      url: "/auth/otp/send",
      payload: { phone: "13800138001", purpose: "login" },
    });
    expect(missing.statusCode).toBe(400);

    const cap = await app.inject({ method: "GET", url: "/auth/captcha" });
    expect(cap.statusCode).toBe(200);
    const { captchaId } = JSON.parse(cap.body) as { captchaId: string };

    const wrong = await app.inject({
      method: "POST",
      url: "/auth/otp/send",
      payload: {
        phone: "13800138001",
        purpose: "login",
        captchaId,
        captchaText: "ZZZZ",
      },
    });
    expect(wrong.statusCode).toBe(400);

    await app.close();
  });
});
