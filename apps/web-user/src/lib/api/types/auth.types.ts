/** 用户端：`phone` + `password`；管理端/演示：`email` + `password` */
export type LoginInput =
  | { phone: string; password: string; email?: undefined }
  | { email: string; password: string; phone?: undefined };

export type OtpPurpose = "login" | "register" | "reset";

export type OtpSendResponse =
  | {
      ok: true;
      phone: string;
      purpose: OtpPurpose;
      expiresInSeconds: number;
      cooldownSeconds: number;
      codeForTest?: string;
    }
  | { message: string; cooldownSeconds?: number };

export type AiQuotaSnapshot = {
  used: number;
  limit: number;
  yearMonth: string;
};

export type PlanTierApi = "basic" | "pro";

export type SubscriptionSourceApi = "none" | "trial" | "paid";

export type OtpVerifyResponse = {
  token: string;
  phone: string;
  userId: string;
  planTier?: PlanTierApi;
  proExpiresAt?: string | null;
  proTrialUsed?: boolean;
  subscriptionSource?: SubscriptionSourceApi;
  billingCycle?: "monthly";
  priceCents?: number;
  aiQuota?: AiQuotaSnapshot | null;
};

export type AuthMeResponse = {
  userId: string;
  email: string;
  role: "user" | "admin";
  permissions?: string[];
  planTier?: PlanTierApi;
  proExpiresAt?: string | null;
  proTrialUsed?: boolean;
  subscriptionSource?: SubscriptionSourceApi;
  billingCycle?: "monthly";
  priceCents?: number;
  aiQuota?: AiQuotaSnapshot | null;
};

export type ForgotPasswordResponse = {
  ok: true;
  mode?: string;
  message: string;
};

export type CaptchaSessionResponse = {
  captchaId: string;
  imageSvg: string;
};
