<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getApiClient, HttpApiError, type OtpPurpose } from '../../lib/api-client';
import { trackEvent } from '../../lib/telemetry';
import { setAuthTier, setAuthToken, setUserPhone } from '../../stores/auth';
import AuthBackground from './AuthBackground.vue';
import UiErrorToast from '../../components/UiErrorToast.vue';

const router = useRouter();
const route = useRoute();
const isRegisterMode = computed(() => route.name === 'register');

/** 登录页：验证码 / 密码 */
const loginMethod = ref<'otp' | 'password'>('otp');

watch(
  () => route.name,
  (name) => {
    if (name === 'register') loginMethod.value = 'otp';
  },
);

const purpose = computed<OtpPurpose>(() => (isRegisterMode.value ? 'register' : 'login'));

const form = reactive({
  phone: '',
  code: '',
  password: '',
  passwordConfirm: '',
});

const showPassword = ref(false);
const showPasswordConfirm = ref(false);

const loadingSend = ref(false);
const loadingVerify = ref(false);
const loadingPasswordLogin = ref(false);
const cooldownLeft = ref(0);
let cooldownTimer: number | null = null;

const errorMessage = ref('');
const errorToastMessage = ref('');

const pageTitle = computed(() => (isRegisterMode.value ? '创建你的账号' : '欢迎回来'));
const pageSubtitle = computed(() => {
  if (isRegisterMode.value) return '验证手机号并设置登录密码';
  if (loginMethod.value === 'password') return '使用手机号与密码登录';
  return '使用短信验证码快速登录';
});
const primaryActionText = computed(() => {
  if (isRegisterMode.value) return '注册并进入';
  if (loginMethod.value === 'password') return '登录';
  return '验证并进入';
});

const primaryLoading = computed(() =>
  loginMethod.value === 'password' && !isRegisterMode.value
    ? loadingPasswordLogin.value
    : loadingVerify.value,
);

function validatePhone(): boolean {
  const p = form.phone.trim();
  if (!/^\d{11}$/.test(p)) {
    errorMessage.value = '请输入 11 位手机号';
    return false;
  }
  errorMessage.value = '';
  return true;
}

function validateCode(): boolean {
  const c = form.code.trim();
  if (!/^\d{6}$/.test(c)) {
    errorMessage.value = '请输入 6 位验证码';
    return false;
  }
  errorMessage.value = '';
  return true;
}

function validateRegisterPasswords(): boolean {
  const p = form.password;
  const c = form.passwordConfirm;
  if (p.length < 8) {
    errorMessage.value = '密码至少 8 位';
    return false;
  }
  if (p !== c) {
    errorMessage.value = '两次输入的密码不一致';
    return false;
  }
  errorMessage.value = '';
  return true;
}

function validateLoginPasswordField(): boolean {
  if (!form.password.trim()) {
    errorMessage.value = '请输入密码';
    return false;
  }
  errorMessage.value = '';
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
  errorToastMessage.value = '';
  if (!validatePhone()) return;
  if (cooldownLeft.value > 0) return;
  loadingSend.value = true;
  try {
    const r = await getApiClient().sendOtp({
      phone: form.phone.trim(),
      purpose: purpose.value,
    });
    if (typeof r === 'object' && r && 'ok' in r && r.ok && 'cooldownSeconds' in r) {
      startCooldown((r as { cooldownSeconds: number }).cooldownSeconds);
    } else {
      startCooldown(60);
    }
    trackEvent('auth_otp_send', { properties: { purpose: purpose.value } });
  } catch (e) {
    if (e instanceof HttpApiError) {
      errorToastMessage.value = e.message;
    } else {
      errorToastMessage.value = e instanceof Error ? e.message : '发送失败，请稍后重试';
    }
  } finally {
    loadingSend.value = false;
  }
}

async function verifyWithOtp() {
  errorToastMessage.value = '';
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
    setAuthTier('basic');
    trackEvent('auth_login', {
      properties: { method: 'otp', purpose: purpose.value },
    });
    await router.push('/plans');
  } catch (e) {
    errorToastMessage.value = e instanceof Error ? e.message : '验证失败，请稍后重试';
  } finally {
    loadingVerify.value = false;
  }
}

async function loginWithPassword() {
  errorToastMessage.value = '';
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
    setAuthTier('basic');
    trackEvent('auth_login', { properties: { method: 'password' } });
    await router.push('/plans');
  } catch (e) {
    errorToastMessage.value = e instanceof Error ? e.message : '登录失败，请稍后重试';
  } finally {
    loadingPasswordLogin.value = false;
  }
}

async function submitForm() {
  if (!isRegisterMode.value && loginMethod.value === 'password') {
    await loginWithPassword();
    return;
  }
  await verifyWithOtp();
}

function setLoginMethod(m: 'otp' | 'password') {
  if (loginMethod.value === m) return;
  loginMethod.value = m;
  errorMessage.value = '';
  // 切换方式时清空另一路径字段，避免带着验证码去点「密码登录」等误提交
  if (m === 'password') {
    form.code = '';
  } else {
    form.password = '';
  }
}

onUnmounted(() => {
  if (cooldownTimer != null) window.clearInterval(cooldownTimer);
  cooldownTimer = null;
});
</script>

<template>
  <AuthBackground>
    <UiErrorToast :message="errorToastMessage" @close="errorToastMessage = ''" />
    <div class="flex min-h-screen w-full flex-col items-center justify-center p-4">
      <div class="w-full max-w-md">
      <div class="mb-8 text-center">
        <h1 class="pb-2 text-[32px] font-bold leading-tight tracking-tight">计划大师</h1>
        <h2 class="pb-2 text-2xl font-bold leading-tight tracking-tight">{{ pageTitle }}</h2>
        <p class="text-base font-normal text-[#61896f]">{{ pageSubtitle }}</p>
      </div>

      <div class="w-full rounded-xl border border-[#dbe6df] bg-white p-8 shadow-sm">
        <div class="flex pb-4">
          <div class="flex h-12 flex-1 items-center justify-center rounded-lg bg-[#f6f8f6] p-1">
            <router-link
              to="/auth/login"
              class="flex h-full grow items-center justify-center overflow-hidden rounded-lg px-2 text-sm font-medium leading-normal transition-all duration-200"
              :class="!isRegisterMode ? 'bg-white text-[#111813] shadow-[0_1px_3px_rgba(0,0,0,0.1)]' : 'text-[#61896f]'"
            >
              登录
            </router-link>
            <router-link
              to="/auth/register"
              class="flex h-full grow items-center justify-center overflow-hidden rounded-lg px-2 text-sm font-medium leading-normal transition-all duration-200"
              :class="isRegisterMode ? 'bg-white text-[#111813] shadow-[0_1px_3px_rgba(0,0,0,0.1)]' : 'text-[#61896f]'"
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
            <label for="login-phone" class="pb-2 text-sm font-medium">手机号</label>
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
            <p class="mt-1.5 text-xs leading-snug text-[#8a9a92]">请填写 11 位中国大陆手机号（不要填写邮箱）。</p>
          </div>

          <template v-if="isRegisterMode">
            <div class="flex flex-col">
              <label for="reg-password" class="pb-2 text-sm font-medium">密码</label>
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
                  <span class="material-symbols-outlined text-xl" aria-hidden="true">{{ showPassword ? 'visibility_off' : 'visibility' }}</span>
                </button>
              </div>
            </div>
            <div class="flex flex-col">
              <label for="reg-password-confirm" class="pb-2 text-sm font-medium">确认密码</label>
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
                  :aria-label="showPasswordConfirm ? '隐藏确认密码' : '显示确认密码'"
                  @click="showPasswordConfirm = !showPasswordConfirm"
                >
                  <span class="material-symbols-outlined text-xl" aria-hidden="true">{{ showPasswordConfirm ? 'visibility_off' : 'visibility' }}</span>
                </button>
              </div>
            </div>
          </template>

          <template v-else-if="loginMethod === 'password'">
            <div class="flex flex-col">
              <label for="login-password-only" class="pb-2 text-sm font-medium">密码</label>
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
                  <span class="material-symbols-outlined text-xl" aria-hidden="true">{{ showPassword ? 'visibility_off' : 'visibility' }}</span>
                </button>
              </div>
            </div>
          </template>

          <template v-if="isRegisterMode || loginMethod === 'otp'">
            <div class="flex flex-col">
              <label for="login-code" class="pb-2 text-sm font-medium">验证码</label>
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
                  {{ cooldownLeft > 0 ? `${cooldownLeft}s` : loadingSend ? '发送中…' : '发送验证码' }}
                </button>
              </div>
            </div>
          </template>

          <div v-if="!isRegisterMode && loginMethod === 'otp'" class="flex justify-end pt-1">
            <router-link to="/auth/forgot-password" class="text-sm font-medium text-primary/80 transition-colors hover:text-primary">
              收不到验证码？
            </router-link>
          </div>

          <p v-if="errorMessage" class="text-sm font-medium text-[#c0392b] dark:text-[#ff8e85]">{{ errorMessage }}</p>

          <button
            class="flex h-12 w-full items-center justify-center rounded-lg bg-primary px-6 text-base font-bold text-black transition-all hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            data-testid="otp-verify"
            :disabled="primaryLoading"
          >
            {{ primaryLoading ? (loginMethod === 'password' && !isRegisterMode ? '登录中…' : '验证中…') : primaryActionText }}
          </button>
        </form>

        <p class="mt-6 text-center text-xs text-[#61896f]">
          新用户请点「注册」：短信验证后设置密码。已注册用户可用验证码或密码登录（未设过密码请用验证码）。
        </p>
      </div>
    </div>
    </div>
  </AuthBackground>
</template>
