<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getApiClient,
  HttpApiError,
  type OtpPurpose,
} from "../../lib/api-client";
import { useAuthCaptcha } from "../../composables/useAuthCaptcha";
import { trackEvent } from "../../lib/telemetry";
import { setAuthTier, setAuthToken, setUserPhone } from "../../stores/auth";
import AuthBackground from "./AuthBackground.vue";
import UiErrorToast from "../../components/UiErrorToast.vue";

const router = useRouter();
const route = useRoute();
const isRegisterMode = computed(() => route.name === "register");

/** 登录页：默认密码登录；注册仍走验证码 */
const loginMethod = ref<"otp" | "password">("password");

watch(
  () => route.name,
  (name) => {
    if (name === "register") loginMethod.value = "otp";
    else if (name === "login") loginMethod.value = "password";
  },
);

const needOtpCaptcha = computed(
  () => isRegisterMode.value || (!isRegisterMode.value && loginMethod.value === "otp"),
);

const {
  captchaId: otpCaptchaId,
  imageDataUrl: otpCaptchaImageUrl,
  loading: otpCaptchaLoading,
  refresh: refreshOtpCaptcha,
  clear: clearOtpCaptcha,
} = useAuthCaptcha();

const form = reactive({
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
      await refreshOtpCaptcha();
    } else {
      form.captchaText = "";
      clearOtpCaptcha();
    }
  },
  { immediate: true },
);

/** 「收不到验证码」说明弹层（不直接等同于忘记密码） */
const showSmsHelp = ref(false);

const purpose = computed<OtpPurpose>(() =>
  isRegisterMode.value ? "register" : "login",
);

const showPassword = ref(false);
const showPasswordConfirm = ref(false);

const loadingSend = ref(false);
const loadingVerify = ref(false);
const loadingPasswordLogin = ref(false);
const cooldownLeft = ref(0);
let cooldownTimer: number | null = null;

const errorMessage = ref("");
const errorToastMessage = ref("");

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

/** 登录/注册表单主体切换动画用 key（验证码 ↔ 密码、登录 ↔ 注册） */
const formPanelKey = computed(() => {
  if (isRegisterMode.value) return "register";
  return loginMethod.value === "password" ? "login-password" : "login-otp";
});

function validatePhone(): boolean {
  const p = form.phone.trim();
  if (!/^\d{11}$/.test(p)) {
    errorMessage.value = "手机号看起来不对，请输入 11 位数字";
    return false;
  }
  errorMessage.value = "";
  return true;
}

function validateCode(): boolean {
  const c = form.code.trim();
  if (!/^\d{6}$/.test(c)) {
    errorMessage.value = "验证码应为 6 位数字";
    return false;
  }
  errorMessage.value = "";
  return true;
}

function validateRegisterPasswords(): boolean {
  const p = form.password;
  const c = form.passwordConfirm;
  if (p.length < 8) {
    errorMessage.value = "密码至少 8 位，建议包含字母和数字";
    return false;
  }
  if (p !== c) {
    errorMessage.value = "两次输入的密码不一致，请再确认一下";
    return false;
  }
  errorMessage.value = "";
  return true;
}

function validateLoginPasswordField(): boolean {
  if (!form.password.trim()) {
    errorMessage.value = "请输入密码";
    return false;
  }
  errorMessage.value = "";
  return true;
}

function startCooldown(seconds: number) {
  cooldownLeft.value = Math.max(0, Math.floor(seconds));
  if (cooldownTimer != null) window.clearInterval(cooldownTimer);
  cooldownTimer = window.setInterval(() => {
    cooldownLeft.value = Math.max(0, cooldownLeft.value - 1);
    if (cooldownLeft.value <= 0 && cooldownTimer != null) {
      window.clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
  }, 1000);
}

async function sendCode() {
  errorToastMessage.value = "";
  if (!validatePhone()) return;
  if (cooldownLeft.value > 0) return;
  if (!otpCaptchaId.value) {
    await refreshOtpCaptcha();
  }
  const captchaText = form.captchaText.trim();
  if (!captchaText) {
    errorToastMessage.value = "请输入图形验证码";
    return;
  }
  loadingSend.value = true;
  try {
    const r = await getApiClient().sendOtp({
      phone: form.phone.trim(),
      purpose: purpose.value,
      captchaId: otpCaptchaId.value,
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
    form.captchaText = "";
    await refreshOtpCaptcha();
    trackEvent("auth_otp_send", { properties: { purpose: purpose.value } });
  } catch (e) {
    if (e instanceof HttpApiError) {
      errorToastMessage.value = e.message;
    } else {
      errorToastMessage.value =
        e instanceof Error ? e.message : "没发出去，请稍后再试";
    }
    form.captchaText = "";
    await refreshOtpCaptcha();
  } finally {
    loadingSend.value = false;
  }
}

async function verifyWithOtp() {
  errorToastMessage.value = "";
  if (!validatePhone()) return;
  if (!validateCode()) return;
  if (isRegisterMode.value && !validateRegisterPasswords()) return;

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
    setAuthTier("basic");
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
  errorToastMessage.value = "";
  if (!validatePhone()) return;
  if (!validateLoginPasswordField()) return;
  loadingPasswordLogin.value = true;
  try {
    const r = await getApiClient().login({
      phone: form.phone.trim(),
      password: form.password,
    });
    setAuthToken(r.token);
    setUserPhone(form.phone.trim());
    setAuthTier("basic");
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
  // 切换方式时清空另一路径字段，避免带着验证码去点「密码登录」等误提交
  if (m === "password") {
    form.code = "";
    form.captchaText = "";
    clearOtpCaptcha();
  } else {
    form.password = "";
    form.captchaText = "";
    void refreshOtpCaptcha();
  }
}

onUnmounted(() => {
  if (cooldownTimer != null) window.clearInterval(cooldownTimer);
  cooldownTimer = null;
});
</script>

<template>
  <AuthBackground>
    <UiErrorToast
      :message="errorToastMessage"
      @close="errorToastMessage = ''"
    />
    <div
      class="flex min-h-screen w-full flex-col items-center justify-center p-4"
    >
      <div class="w-full max-w-md">
        <div class="mb-8 text-center">
          <h1 class="pb-2 text-[32px] font-bold leading-tight tracking-tight">
            计划大师
          </h1>
          <h2 class="pb-2 text-2xl font-bold leading-tight tracking-tight">
            {{ pageTitle }}
          </h2>
          <p class="text-base font-normal text-[#61896f]">{{ pageSubtitle }}</p>
        </div>

        <div
          class="w-full rounded-xl border border-[#dbe6df] bg-white p-8 shadow-sm"
        >
          <div class="flex pb-4">
            <div
              class="flex h-12 flex-1 items-center justify-center rounded-lg bg-[#f6f8f6] p-1"
            >
              <router-link
                to="/auth/login"
                class="flex h-full grow items-center justify-center overflow-hidden rounded-lg px-2 text-sm font-medium leading-normal transition-all duration-200"
                :class="
                  !isRegisterMode
                    ? 'bg-white text-[#111813] shadow-[0_1px_3px_rgba(0,0,0,0.1)]'
                    : 'text-[#61896f]'
                "
              >
                登录
              </router-link>
              <router-link
                to="/auth/register"
                class="flex h-full grow items-center justify-center overflow-hidden rounded-lg px-2 text-sm font-medium leading-normal transition-all duration-200"
                :class="
                  isRegisterMode
                    ? 'bg-white text-[#111813] shadow-[0_1px_3px_rgba(0,0,0,0.1)]'
                    : 'text-[#61896f]'
                "
              >
                注册
              </router-link>
            </div>
          </div>

          <p
            v-if="!isRegisterMode"
            class="mb-6 flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-center text-sm text-[#61896f]"
          >
            <template v-if="loginMethod === 'otp'">
              <span>短信验证码登录</span>
              <span class="text-[#dbe6df]" aria-hidden="true">·</span>
              <button
                type="button"
                class="font-semibold text-primary/90 underline decoration-primary/30 underline-offset-2 transition hover:text-primary hover:decoration-primary"
                data-testid="login-switch-password"
                @click="setLoginMethod('password')"
              >
                改用密码登录
              </button>
            </template>
            <template v-else>
              <span>手机号 + 密码登录</span>
              <span class="text-[#dbe6df]" aria-hidden="true">·</span>
              <button
                type="button"
                class="font-semibold text-primary/90 underline decoration-primary/30 underline-offset-2 transition hover:text-primary hover:decoration-primary"
                data-testid="login-switch-otp"
                @click="setLoginMethod('otp')"
              >
                改用验证码登录
              </button>
            </template>
          </p>

          <form class="space-y-6" @submit.prevent="submitForm">
            <div class="flex flex-col">
              <label for="login-phone" class="pb-2 text-sm font-medium"
                >手机号</label
              >
              <input
                id="login-phone"
                v-model="form.phone"
                type="text"
                inputmode="numeric"
                maxlength="11"
                autocomplete="tel"
                aria-label="手机号"
                class="h-12 rounded-lg border border-[#dbe6df] bg-white p-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 focus:ring-offset-0"
                placeholder="请输入 11 位手机号"
              />
              <p class="mt-1.5 text-xs leading-snug text-[#8a9a92]">
                请填写 11 位中国大陆手机号
              </p>
            </div>

            <Transition name="auth-form-panel" mode="out-in">
              <div :key="formPanelKey" class="space-y-6">
                <template v-if="isRegisterMode">
                  <div class="flex flex-col">
                    <label for="reg-password" class="pb-2 text-sm font-medium"
                      >密码</label
                    >
                    <div
                      class="flex w-full min-w-0 items-stretch rounded-lg border border-[#dbe6df] bg-white outline-none transition-[box-shadow,border-color] focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/50 focus-within:ring-offset-0"
                    >
                      <input
                        id="reg-password"
                        v-model="form.password"
                        :type="showPassword ? 'text' : 'password'"
                        autocomplete="new-password"
                        aria-label="密码"
                        class="h-12 min-w-0 flex-1 rounded-l-lg border-0 border-r border-[#dbe6df] bg-transparent p-3 pr-2 text-base outline-none ring-0 focus:border-transparent focus:ring-0 focus:outline-none"
                        placeholder="至少 8 位"
                      />
                      <button
                        type="button"
                        class="flex shrink-0 items-center justify-center rounded-r-lg border-0 bg-white px-3 text-[#61896f] !outline-none hover:bg-[#f6f8f6] focus-visible:ring-0"
                        :aria-pressed="showPassword"
                        :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                        @click="showPassword = !showPassword"
                      >
                        <span
                          class="material-symbols-outlined text-xl"
                          aria-hidden="true"
                          >{{
                            showPassword ? "visibility_off" : "visibility"
                          }}</span
                        >
                      </button>
                    </div>
                  </div>
                  <div class="flex flex-col">
                    <label
                      for="reg-password-confirm"
                      class="pb-2 text-sm font-medium"
                      >确认密码</label
                    >
                    <div
                      class="flex w-full min-w-0 items-stretch rounded-lg border border-[#dbe6df] bg-white outline-none transition-[box-shadow,border-color] focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/50 focus-within:ring-offset-0"
                    >
                      <input
                        id="reg-password-confirm"
                        v-model="form.passwordConfirm"
                        :type="showPasswordConfirm ? 'text' : 'password'"
                        autocomplete="new-password"
                        aria-label="确认密码"
                        class="h-12 min-w-0 flex-1 rounded-l-lg border-0 border-r border-[#dbe6df] bg-transparent p-3 pr-2 text-base outline-none ring-0 focus:border-transparent focus:ring-0 focus:outline-none"
                        placeholder="再次输入密码"
                      />
                      <button
                        type="button"
                        class="flex shrink-0 items-center justify-center rounded-r-lg border-0 bg-white px-3 text-[#61896f] !outline-none hover:bg-[#f6f8f6] focus-visible:ring-0"
                        :aria-pressed="showPasswordConfirm"
                        :aria-label="
                          showPasswordConfirm ? '隐藏确认密码' : '显示确认密码'
                        "
                        @click="showPasswordConfirm = !showPasswordConfirm"
                      >
                        <span
                          class="material-symbols-outlined text-xl"
                          aria-hidden="true"
                          >{{
                            showPasswordConfirm
                              ? "visibility_off"
                              : "visibility"
                          }}</span
                        >
                      </button>
                    </div>
                  </div>
                  <div
                    class="flex flex-col gap-2 rounded-lg border border-[#dbe6df] bg-[#fafcfb] p-3"
                  >
                    <div
                      class="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span class="text-sm font-medium text-[#111813]"
                        >图形验证码</span
                      >
                      <button
                        type="button"
                        class="text-sm font-semibold text-primary/90 underline decoration-primary/30 underline-offset-2 transition hover:text-primary hover:decoration-primary"
                        data-testid="captcha-refresh"
                        :disabled="otpCaptchaLoading"
                        @click="refreshOtpCaptcha()"
                      >
                        {{ otpCaptchaLoading ? "加载中…" : "换一张" }}
                      </button>
                    </div>
                    <div class="flex flex-wrap items-center gap-3">
                      <img
                        v-if="otpCaptchaImageUrl"
                        :src="otpCaptchaImageUrl"
                        alt="图形验证码"
                        width="132"
                        height="44"
                        class="h-11 rounded border border-[#dbe6df] bg-white object-contain"
                      />
                      <input
                        v-model="form.captchaText"
                        type="text"
                        maxlength="12"
                        autocomplete="off"
                        autocapitalize="characters"
                        spellcheck="false"
                        aria-label="图形验证码"
                        class="h-12 w-[8.5rem] rounded-lg border border-[#dbe6df] bg-white px-3 text-base uppercase outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 focus:ring-offset-0"
                        placeholder="图中字符"
                      />
                    </div>
                  </div>
                  <div class="flex flex-col">
                    <label for="login-code" class="pb-2 text-sm font-medium"
                      >验证码</label
                    >
                    <div class="flex w-full min-w-0 items-stretch gap-2">
                      <input
                        id="login-code"
                        v-model="form.code"
                        type="text"
                        inputmode="numeric"
                        autocomplete="one-time-code"
                        aria-label="验证码"
                        class="h-12 min-w-0 flex-1 rounded-lg border border-[#dbe6df] bg-white p-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 focus:ring-offset-0"
                        placeholder="6 位验证码"
                      />
                      <button
                        type="button"
                        class="flex shrink-0 items-center justify-center rounded-lg border border-[#dbe6df] bg-white px-3 text-sm font-bold text-[#111813] transition hover:bg-[#f6f8f6] disabled:cursor-not-allowed disabled:opacity-60"
                        data-testid="otp-send"
                        :disabled="loadingSend || cooldownLeft > 0"
                        @click="sendCode"
                      >
                        {{
                          cooldownLeft > 0
                            ? `${cooldownLeft}s`
                            : loadingSend
                              ? "发送中…"
                              : "发送验证码"
                        }}
                      </button>
                    </div>
                  </div>
                </template>

                <template v-else-if="loginMethod === 'password'">
                  <div class="flex flex-col">
                    <label
                      for="login-password-only"
                      class="pb-2 text-sm font-medium"
                      >密码</label
                    >
                    <div
                      class="flex w-full min-w-0 items-stretch rounded-lg border border-[#dbe6df] bg-white outline-none transition-[box-shadow,border-color] focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/50 focus-within:ring-offset-0"
                    >
                      <input
                        id="login-password-only"
                        v-model="form.password"
                        :type="showPassword ? 'text' : 'password'"
                        autocomplete="current-password"
                        aria-label="密码"
                        class="h-12 min-w-0 flex-1 rounded-l-lg border-0 border-r border-[#dbe6df] bg-transparent p-3 pr-2 text-base outline-none ring-0 focus:border-transparent focus:ring-0 focus:outline-none"
                        placeholder="请输入密码"
                      />
                      <button
                        type="button"
                        class="flex shrink-0 items-center justify-center rounded-r-lg border-0 bg-white px-3 text-[#61896f] !outline-none hover:bg-[#f6f8f6] focus-visible:ring-0"
                        :aria-pressed="showPassword"
                        :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                        @click="showPassword = !showPassword"
                      >
                        <span
                          class="material-symbols-outlined text-xl"
                          aria-hidden="true"
                          >{{
                            showPassword ? "visibility_off" : "visibility"
                          }}</span
                        >
                      </button>
                    </div>
                  </div>
                  <div class="flex justify-end pt-1">
                    <router-link
                      to="/auth/forgot-password"
                      class="text-sm font-medium text-[#7c8a84] underline decoration-[#dbe6df] underline-offset-2 transition-colors hover:text-primary hover:decoration-primary/50"
                      data-testid="login-forgot-password"
                    >
                      忘记密码？
                    </router-link>
                  </div>
                </template>

                <template v-else>
                  <div
                    class="flex flex-col gap-2 rounded-lg border border-[#dbe6df] bg-[#fafcfb] p-3"
                  >
                    <div
                      class="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span class="text-sm font-medium text-[#111813]"
                        >图形验证码</span
                      >
                      <button
                        type="button"
                        class="text-sm font-semibold text-primary/90 underline decoration-primary/30 underline-offset-2 transition hover:text-primary hover:decoration-primary"
                        data-testid="captcha-refresh-login-otp"
                        :disabled="otpCaptchaLoading"
                        @click="refreshOtpCaptcha()"
                      >
                        {{ otpCaptchaLoading ? "加载中…" : "换一张" }}
                      </button>
                    </div>
                    <div class="flex flex-wrap items-center gap-3">
                      <img
                        v-if="otpCaptchaImageUrl"
                        :src="otpCaptchaImageUrl"
                        alt="图形验证码"
                        width="132"
                        height="44"
                        class="h-11 rounded border border-[#dbe6df] bg-white object-contain"
                      />
                      <input
                        v-model="form.captchaText"
                        type="text"
                        maxlength="12"
                        autocomplete="off"
                        autocapitalize="characters"
                        spellcheck="false"
                        aria-label="图形验证码"
                        class="h-12 w-[8.5rem] rounded-lg border border-[#dbe6df] bg-white px-3 text-base uppercase outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 focus:ring-offset-0"
                        placeholder="图中字符"
                      />
                    </div>
                  </div>
                  <div class="flex flex-col">
                    <label for="login-code-otp" class="pb-2 text-sm font-medium"
                      >验证码</label
                    >
                    <div class="flex w-full min-w-0 items-stretch gap-2">
                      <input
                        id="login-code-otp"
                        v-model="form.code"
                        type="text"
                        inputmode="numeric"
                        autocomplete="one-time-code"
                        aria-label="验证码"
                        class="h-12 min-w-0 flex-1 rounded-lg border border-[#dbe6df] bg-white p-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 focus:ring-offset-0"
                        placeholder="6 位验证码"
                      />
                      <button
                        type="button"
                        class="flex shrink-0 items-center justify-center rounded-lg border border-[#dbe6df] bg-white px-3 text-sm font-bold text-[#111813] transition hover:bg-[#f6f8f6] disabled:cursor-not-allowed disabled:opacity-60"
                        data-testid="otp-send"
                        :disabled="loadingSend || cooldownLeft > 0"
                        @click="sendCode"
                      >
                        {{
                          cooldownLeft > 0
                            ? `${cooldownLeft}s`
                            : loadingSend
                              ? "发送中…"
                              : "发送验证码"
                        }}
                      </button>
                    </div>
                  </div>
                  <div class="flex justify-end pt-1">
                    <button
                      type="button"
                      class="text-sm font-medium text-primary/80 underline decoration-primary/25 underline-offset-2 transition-colors hover:text-primary hover:decoration-primary/50"
                      data-testid="login-sms-help"
                      @click="showSmsHelp = true"
                    >
                      收不到验证码？
                    </button>
                  </div>
                </template>
              </div>
            </Transition>

            <p
              v-if="errorMessage"
              class="text-sm font-medium text-[#c0392b] dark:text-[#ff8e85]"
            >
              {{ errorMessage }}
            </p>

            <button
              class="flex h-12 w-full items-center justify-center rounded-lg bg-primary px-6 text-base font-bold text-black transition-all hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              data-testid="otp-verify"
              :disabled="primaryLoading"
            >
              {{
                primaryLoading
                  ? loginMethod === "password" && !isRegisterMode
                    ? "登录中…"
                    : "验证中…"
                  : primaryActionText
              }}
            </button>
          </form>

          <p class="mt-6 text-center text-xs text-[#61896f]">
            新用户请点「注册」：短信验证后设置密码。已注册用户默认密码登录；未设过密码请改用验证码。收不到短信请点「收不到验证码？」查看说明。
          </p>
        </div>
      </div>
    </div>

    <div
      v-if="showSmsHelp"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      data-testid="login-sms-help-overlay"
      role="presentation"
      @click.self="showSmsHelp = false"
    >
      <div
        class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-sms-help-title"
        @click.stop
      >
        <div class="flex items-start justify-between gap-3">
          <h3 id="login-sms-help-title" class="text-lg font-extrabold text-stone-900">
            收不到验证码？
          </h3>
          <button
            type="button"
            class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-700 ring-1 ring-stone-200/80 transition hover:bg-stone-200/70"
            aria-label="关闭"
            @click="showSmsHelp = false"
          >
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
          </button>
        </div>
        <ul class="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-stone-600">
          <li>请确认填写的是 <strong>11 位手机号</strong>，且未误填邮箱。</li>
          <li>验证码发送有 <strong>冷却时间</strong>，请稍后再点「发送验证码」。</li>
          <li>同一手机号每日获取次数有限，超过上限需次日再试。</li>
          <li>如果仍收不到短信，可以改用<strong>密码登录</strong>，或稍后再试。</li>
        </ul>
        <p class="mt-5 text-sm leading-relaxed text-stone-600">
          若你记得账号但需要<strong>重置登录密码</strong>（与「收不到短信」不同），请前往
          <router-link
            to="/auth/forgot-password"
            class="font-semibold text-primary underline decoration-primary/30 underline-offset-2"
            @click="showSmsHelp = false"
            >忘记密码</router-link
          >
          。
        </p>
        <div class="mt-6 flex justify-end">
          <button
            type="button"
            class="rounded-lg bg-[#111813] px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#0d1410]"
            @click="showSmsHelp = false"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  </AuthBackground>
</template>

<style scoped>
.auth-form-panel-enter-active,
.auth-form-panel-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.auth-form-panel-enter-from,
.auth-form-panel-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
@media (prefers-reduced-motion: reduce) {
  .auth-form-panel-enter-active,
  .auth-form-panel-leave-active {
    transition: none;
  }
  .auth-form-panel-enter-from,
  .auth-form-panel-leave-to {
    transform: none;
  }
}
</style>
