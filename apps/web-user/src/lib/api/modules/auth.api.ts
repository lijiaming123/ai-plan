import type { RequestFn } from "../http";
import type {
  AiQuotaSnapshot,
  AuthMeResponse,
  CaptchaSessionResponse,
  ForgotPasswordResponse,
  LoginInput,
  OtpPurpose,
  OtpSendResponse,
  OtpVerifyResponse,
  PlanTierApi,
} from "../types/auth.types";

export type AuthApi = {
  /** 用户端传 `phone`；管理端传 `email`。 */
  login(input: LoginInput): Promise<{
    token: string;
    planTier?: PlanTierApi;
    proExpiresAt?: string | null;
    aiQuota?: AiQuotaSnapshot | null;
  }>;
  forgotPassword(input: { email: string }): Promise<ForgotPasswordResponse>;
  getCaptcha(): Promise<CaptchaSessionResponse>;
  sendOtp(input: {
    phone: string;
    purpose?: OtpPurpose;
    captchaId: string;
    captchaText: string;
  }): Promise<OtpSendResponse>;
  verifyOtp(input: {
    phone: string;
    code: string;
    purpose?: OtpPurpose;
    password?: string;
    passwordConfirm?: string;
  }): Promise<OtpVerifyResponse>;
  getAuthMe(input: { token: string }): Promise<AuthMeResponse>;
  startProTrial(input: { token: string }): Promise<AuthMeResponse>;
};

export function createAuthApi(request: RequestFn): AuthApi {
  return {
    login(input) {
      return request<{ token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    forgotPassword(input) {
      return request<ForgotPasswordResponse>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: input.email }),
      });
    },
    getCaptcha() {
      return request<CaptchaSessionResponse>("/auth/captcha", {
        method: "GET",
      });
    },
    sendOtp(input) {
      return request<OtpSendResponse>("/auth/otp/send", {
        method: "POST",
        body: JSON.stringify({
          phone: input.phone,
          purpose: input.purpose ?? "login",
          captchaId: input.captchaId,
          captchaText: input.captchaText,
        }),
      });
    },
    verifyOtp(input) {
      return request<OtpVerifyResponse>("/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({
          phone: input.phone,
          code: input.code,
          purpose: input.purpose ?? "login",
          ...(input.password != null ? { password: input.password } : {}),
          ...(input.passwordConfirm != null
            ? { passwordConfirm: input.passwordConfirm }
            : {}),
        }),
      });
    },
    getAuthMe(input) {
      return request<AuthMeResponse>("/auth/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    startProTrial(input) {
      return request<AuthMeResponse>("/auth/start-pro-trial", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
  };
}
