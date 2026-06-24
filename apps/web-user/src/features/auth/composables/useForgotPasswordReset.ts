import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthCaptcha } from "../../../composables/useAuthCaptcha";
import { useErrorToast } from "../../../composables/useErrorToast";
import { getApiClient } from "../../../lib/api-client";
import { trackEvent } from "../../../lib/telemetry";
import {
  setAuthBillingFromMe,
  setAuthToken,
  setUserPhone,
} from "../../../stores/auth";
import { type AuthOtpForm, useAuthOtpSend } from "./useAuthOtpFlow";

export function useForgotPasswordReset() {
  const router = useRouter();
  const captcha = useAuthCaptcha();
  const form = reactive<AuthOtpForm>({
    phone: "",
    code: "",
    password: "",
    passwordConfirm: "",
    captchaText: "",
  });

  const loadingVerify = ref(false);
  const fieldError = ref("");
  const sendHint = ref("");
  const { errorToastMessage, clearError } = useErrorToast();

  function validatePhone(): boolean {
    if (!/^\d{11}$/.test(form.phone.trim())) {
      fieldError.value = "请输入 11 位手机号";
      return false;
    }
    fieldError.value = "";
    return true;
  }

  function validateCode(): boolean {
    if (!/^\d{6}$/.test(form.code.trim())) {
      fieldError.value = "请输入 6 位验证码";
      return false;
    }
    fieldError.value = "";
    return true;
  }

  function validatePasswords(): boolean {
    if (form.password.length < 8) {
      fieldError.value = "新密码至少 8 位";
      return false;
    }
    if (form.password !== form.passwordConfirm) {
      fieldError.value = "两次输入的密码不一致";
      return false;
    }
    fieldError.value = "";
    return true;
  }

  const otpSend = useAuthOtpSend({
    form,
    purpose: () => "reset" as const,
    captchaId: captcha.captchaId,
    refreshCaptcha: captcha.refresh,
    errorToastMessage,
    validatePhone,
    sendErrorFallback: "发送失败，请稍后重试",
  });

  async function sendCode() {
    sendHint.value = "";
    if (await otpSend.sendCode()) {
      sendHint.value =
        "验证码已发送。演示环境请查看服务端日志；生产环境将收到短信。";
    }
  }

  async function verifyAndEnter() {
    clearError();
    sendHint.value = "";
    if (!validatePhone()) return;
    if (!validateCode()) return;
    if (!validatePasswords()) return;
    loadingVerify.value = true;
    try {
      const r = await getApiClient().verifyOtp({
        phone: form.phone.trim(),
        code: form.code.trim(),
        purpose: "reset",
        password: form.password,
        passwordConfirm: form.passwordConfirm,
      });
      setAuthToken(r.token);
      setUserPhone(r.phone);
      setAuthBillingFromMe(r);
      trackEvent("auth_login", {
        properties: { method: "otp_reset_password", purpose: "reset" },
      });
      await router.push("/plans");
    } catch (e) {
      errorToastMessage.value =
        e instanceof Error ? e.message : "验证失败，请稍后重试";
    } finally {
      loadingVerify.value = false;
    }
  }

  onMounted(() => {
    void captcha.refresh();
  });

  return {
    form,
    fieldError,
    sendHint,
    errorToastMessage,
    clearError,
    loadingVerify,
    loadingSend: otpSend.loadingSend,
    cooldownLeft: otpSend.cooldownLeft,
    otpCaptchaImageUrl: captcha.imageDataUrl,
    otpCaptchaLoading: captcha.loading,
    refreshOtpCaptcha: captcha.refresh,
    sendCode,
    verifyAndEnter,
  };
}
