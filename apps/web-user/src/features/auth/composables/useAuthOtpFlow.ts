import { ref, type Ref } from "vue";
import {
  getApiClient,
  HttpApiError,
  type OtpPurpose,
} from "../../../lib/api-client";
import { trackEvent } from "../../../lib/telemetry";
import { useOtpCooldown } from "../../../composables/useOtpCooldown";

export type AuthOtpForm = {
  phone: string;
  code: string;
  password: string;
  passwordConfirm: string;
  captchaText: string;
};

export function validateAuthPhone(
  phone: string,
  setError: (msg: string) => void,
): boolean {
  if (!/^\d{11}$/.test(phone.trim())) {
    setError("手机号看起来不对，请输入 11 位数字");
    return false;
  }
  setError("");
  return true;
}

export function validateAuthCode(
  code: string,
  setError: (msg: string) => void,
): boolean {
  if (!/^\d{6}$/.test(code.trim())) {
    setError("验证码应为 6 位数字");
    return false;
  }
  setError("");
  return true;
}

export function validateAuthPasswordPair(
  password: string,
  confirm: string,
  setError: (msg: string) => void,
  label = "密码",
): boolean {
  if (password.length < 8) {
    setError(`${label}至少 8 位，建议包含字母和数字`);
    return false;
  }
  if (password !== confirm) {
    setError("两次输入的密码不一致，请再确认一下");
    return false;
  }
  setError("");
  return true;
}

export function validateAuthLoginPassword(
  password: string,
  setError: (msg: string) => void,
): boolean {
  if (!password.trim()) {
    setError("请输入密码");
    return false;
  }
  setError("");
  return true;
}

/** OTP 发送 + 冷却（Login / Forgot 共用） */
export function useAuthOtpSend(params: {
  form: AuthOtpForm;
  purpose: Ref<OtpPurpose> | (() => OtpPurpose);
  captchaId: Ref<string>;
  refreshCaptcha: () => Promise<void>;
  errorToastMessage: Ref<string>;
  validatePhone?: () => boolean;
  sendErrorFallback?: string;
}) {
  const loadingSend = ref(false);
  const { cooldownLeft, startCooldown } = useOtpCooldown();

  async function sendCode() {
    params.errorToastMessage.value = "";
    if (params.validatePhone) {
      if (!params.validatePhone()) return false;
    } else if (
      !validateAuthPhone(params.form.phone, () => {})
    ) {
      return false;
    }
    if (cooldownLeft.value > 0) return false;

    if (!params.captchaId.value) {
      await params.refreshCaptcha();
    }
    const captchaText = params.form.captchaText.trim();
    if (!captchaText) {
      params.errorToastMessage.value = "请输入图形验证码";
      return false;
    }

    const purpose =
      typeof params.purpose === "function"
        ? params.purpose()
        : params.purpose.value;

    loadingSend.value = true;
    try {
      const r = await getApiClient().sendOtp({
        phone: params.form.phone.trim(),
        purpose,
        captchaId: params.captchaId.value,
        captchaText,
      });
      if (
        typeof r === "object" &&
        r &&
        "ok" in r &&
        r.ok &&
        "cooldownSeconds" in r
      ) {
        startCooldown((r as { cooldownSeconds: number }).cooldownSeconds);
      } else {
        startCooldown(60);
      }
      params.form.captchaText = "";
      await params.refreshCaptcha();
      trackEvent("auth_otp_send", { properties: { purpose } });
      return true;
    } catch (e) {
      params.errorToastMessage.value =
        e instanceof HttpApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : (params.sendErrorFallback ?? "没发出去，请稍后再试");
      params.form.captchaText = "";
      await params.refreshCaptcha();
      return false;
    } finally {
      loadingSend.value = false;
    }
  }

  return { loadingSend, cooldownLeft, sendCode, startCooldown };
}
