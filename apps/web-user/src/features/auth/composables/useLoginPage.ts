import { computed, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getApiClient, type OtpPurpose } from "../../../lib/api-client";
import { useAuthCaptcha } from "../../../composables/useAuthCaptcha";
import { useErrorToast } from "../../../composables/useErrorToast";
import { trackEvent } from "../../../lib/telemetry";
import { setAuthBillingFromMe, setAuthToken, setUserPhone } from "../../../stores/auth";
import {
  type AuthOtpForm,
  useAuthOtpSend,
  validateAuthCode,
  validateAuthLoginPassword,
  validateAuthPasswordPair,
  validateAuthPhone,
} from "./useAuthOtpFlow";

export function useLoginPage() {
  const router = useRouter();
  const route = useRoute();
  const isRegisterMode = computed(() => route.name === "register");
  const loginMethod = ref<"otp" | "password">("password");

  watch(
    () => route.name,
    (name) => {
      if (name === "register") loginMethod.value = "otp";
      else if (name === "login") loginMethod.value = "password";
      if (name !== "register") agreedToLegal.value = false;
    },
  );

  const needOtpCaptcha = computed(
    () =>
      isRegisterMode.value ||
      (!isRegisterMode.value && loginMethod.value === "otp"),
  );

  const captcha = useAuthCaptcha();
  const form = reactive<AuthOtpForm>({
    phone: "",
    code: "",
    password: "",
    passwordConfirm: "",
    captchaText: "",
  });

  watch(
    () => [needOtpCaptcha.value, route.fullPath] as const,
    async ([need]) => {
      if (need) {
        form.captchaText = "";
        await captcha.refresh();
      } else {
        form.captchaText = "";
        captcha.clear();
      }
    },
    { immediate: true },
  );

  const showSmsHelp = ref(false);
  const purpose = computed<OtpPurpose>(() =>
    isRegisterMode.value ? "register" : "login",
  );
  const loadingVerify = ref(false);
  const loadingPasswordLogin = ref(false);
  const errorMessage = ref("");
  const { errorToastMessage, clearError } = useErrorToast();
  const agreedToLegal = ref(false);

  const otpSend = useAuthOtpSend({
    form,
    purpose,
    captchaId: captcha.captchaId,
    refreshCaptcha: captcha.refresh,
    errorToastMessage,
    validatePhone: () =>
      validateAuthPhone(form.phone, (m) => (errorMessage.value = m)),
  });

  const pageTitle = computed(() =>
    isRegisterMode.value ? "创建你的账号" : "欢迎回来",
  );
  const pageSubtitle = computed(() => {
    if (isRegisterMode.value) return "验证手机号并设置登录密码";
    if (loginMethod.value === "password") return "使用手机号与密码登录";
    return "使用短信验证码快速登录";
  });
  const primaryActionText = computed(() => {
    if (isRegisterMode.value) return "注册并进入";
    if (loginMethod.value === "password") return "登录";
    return "验证并进入";
  });
  const primaryLoading = computed(() =>
    loginMethod.value === "password" && !isRegisterMode.value
      ? loadingPasswordLogin.value
      : loadingVerify.value,
  );
  const formPanelKey = computed(() => {
    if (isRegisterMode.value) return "register";
    return loginMethod.value === "password" ? "login-password" : "login-otp";
  });

  function validateLegalConsent(): boolean {
    if (!isRegisterMode.value) return true;
    if (!agreedToLegal.value) {
      errorMessage.value = "请先阅读并同意用户协议与隐私政策";
      return false;
    }
    errorMessage.value = "";
    return true;
  }

  async function verifyWithOtp() {
    clearError();
    if (!validateAuthPhone(form.phone, (m) => (errorMessage.value = m))) return;
    if (!validateAuthCode(form.code, (m) => (errorMessage.value = m))) return;
    if (
      isRegisterMode.value &&
      !validateAuthPasswordPair(
        form.password,
        form.passwordConfirm,
        (m) => (errorMessage.value = m),
      )
    ) {
      return;
    }
    if (!validateLegalConsent()) return;

    loadingVerify.value = true;
    try {
      const r = await getApiClient().verifyOtp({
        phone: form.phone.trim(),
        code: form.code.trim(),
        purpose: purpose.value,
        ...(isRegisterMode.value
          ? { password: form.password, passwordConfirm: form.passwordConfirm }
          : {}),
      });
      setAuthToken(r.token);
      setUserPhone(r.phone);
      setAuthBillingFromMe(r);
      trackEvent("auth_login", {
        properties: { method: "otp", purpose: purpose.value },
      });
      await router.push("/plans");
    } catch (e) {
      errorToastMessage.value =
        e instanceof Error ? e.message : "没验证成功，请稍后再试";
    } finally {
      loadingVerify.value = false;
    }
  }

  async function loginWithPassword() {
    clearError();
    if (!validateAuthPhone(form.phone, (m) => (errorMessage.value = m))) return;
    if (
      !validateAuthLoginPassword(form.password, (m) => (errorMessage.value = m))
    ) {
      return;
    }
    loadingPasswordLogin.value = true;
    try {
      const r = await getApiClient().login({
        phone: form.phone.trim(),
        password: form.password,
      });
      setAuthToken(r.token);
      setUserPhone(form.phone.trim());
      setAuthBillingFromMe(r);
      trackEvent("auth_login", { properties: { method: "password" } });
      await router.push("/plans");
    } catch (e) {
      errorToastMessage.value =
        e instanceof Error ? e.message : "没登录成功，请稍后再试";
    } finally {
      loadingPasswordLogin.value = false;
    }
  }

  async function submitForm() {
    if (!isRegisterMode.value && loginMethod.value === "password") {
      await loginWithPassword();
      return;
    }
    await verifyWithOtp();
  }

  function setLoginMethod(m: "otp" | "password") {
    if (loginMethod.value === m) return;
    loginMethod.value = m;
    errorMessage.value = "";
    if (m === "password") {
      form.code = "";
      form.captchaText = "";
      captcha.clear();
    } else {
      form.password = "";
      form.captchaText = "";
      void captcha.refresh();
    }
  }

  return {
    isRegisterMode,
    loginMethod,
    form,
    showSmsHelp,
    errorMessage,
    errorToastMessage,
    clearError,
    agreedToLegal,
    otpCaptchaImageUrl: captcha.imageDataUrl,
    otpCaptchaLoading: captcha.loading,
    refreshOtpCaptcha: captcha.refresh,
    loadingSend: otpSend.loadingSend,
    cooldownLeft: otpSend.cooldownLeft,
    sendCode: otpSend.sendCode,
    pageTitle,
    pageSubtitle,
    primaryActionText,
    primaryLoading,
    formPanelKey,
    submitForm,
    setLoginMethod,
  };
}

export type LoginPageState = ReturnType<typeof useLoginPage>;
