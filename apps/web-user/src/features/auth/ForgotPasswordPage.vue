<script setup lang="ts">
import { onUnmounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import AuthBackground from './AuthBackground.vue';
import UiErrorToast from '../../components/UiErrorToast.vue';
import { getApiClient, HttpApiError } from '../../lib/api-client';
import { trackEvent } from '../../lib/telemetry';
import { setAuthTier, setAuthToken, setUserPhone } from '../../stores/auth';

const router = useRouter();

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
const cooldownLeft = ref(0);
let cooldownTimer: number | null = null;

const fieldError = ref('');
const errorToastMessage = ref('');
const sendHint = ref('');

function validatePhone(): boolean {
  const p = form.phone.trim();
  if (!/^\d{11}$/.test(p)) {
    fieldError.value = '请输入 11 位手机号';
    return false;
  }
  fieldError.value = '';
  return true;
}

function validateCode(): boolean {
  const c = form.code.trim();
  if (!/^\d{6}$/.test(c)) {
    fieldError.value = '请输入 6 位验证码';
    return false;
  }
  fieldError.value = '';
  return true;
}

function validatePasswords(): boolean {
  const p = form.password;
  const c = form.passwordConfirm;
  if (p.length < 8) {
    fieldError.value = '新密码至少 8 位';
    return false;
  }
  if (p !== c) {
    fieldError.value = '两次输入的密码不一致';
    return false;
  }
  fieldError.value = '';
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
  sendHint.value = '';
  if (!validatePhone()) return;
  if (cooldownLeft.value > 0) return;
  loadingSend.value = true;
  try {
    const r = await getApiClient().sendOtp({
      phone: form.phone.trim(),
      purpose: 'reset',
    });
    if (typeof r === 'object' && r && 'ok' in r && r.ok && 'cooldownSeconds' in r) {
      startCooldown((r as { cooldownSeconds: number }).cooldownSeconds);
    } else {
      startCooldown(60);
    }
    sendHint.value = '验证码已发送。演示环境请查看服务端日志；生产环境将收到短信。';
    trackEvent('auth_otp_send', { properties: { purpose: 'reset' } });
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

async function verifyAndEnter() {
  errorToastMessage.value = '';
  sendHint.value = '';
  if (!validatePhone()) return;
  if (!validateCode()) return;
  if (!validatePasswords()) return;
  loadingVerify.value = true;
  try {
    const r = await getApiClient().verifyOtp({
      phone: form.phone.trim(),
      code: form.code.trim(),
      purpose: 'reset',
      password: form.password,
      passwordConfirm: form.passwordConfirm,
    });
    setAuthToken(r.token);
    setUserPhone(r.phone);
    setAuthTier('basic');
    trackEvent('auth_login', { properties: { method: 'otp_reset_password', purpose: 'reset' } });
    await router.push('/plans');
  } catch (e) {
    errorToastMessage.value = e instanceof Error ? e.message : '验证失败，请稍后重试';
  } finally {
    loadingVerify.value = false;
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
    <div class="mx-auto flex w-full max-w-[960px] flex-1 flex-col px-4 py-5">
      <header class="flex items-center justify-between border-b border-b-[#f0f4f2] px-10 py-3">
        <div class="flex items-center gap-4">
          <div class="size-6 text-primary">
            <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path
                clip-rule="evenodd"
                d="M12.0799 24L4 19.2479L9.95537 8.75216L18.04 13.4961L18.0446 4H29.9554L29.96 13.4961L38.0446 8.75216L44 19.2479L35.92 24L44 28.7521L38.0446 39.2479L29.96 34.5039L29.9554 44H18.0446L18.04 34.5039L9.95537 39.2479L4 28.7521L12.0799 24Z"
                fill="currentColor"
                fill-rule="evenodd"
              />
            </svg>
          </div>
          <h2 class="text-lg font-bold leading-tight tracking-[-0.015em]">PlanMaster</h2>
        </div>
        <router-link
          to="/auth/login"
          class="text-sm font-medium text-[#111813]/80 transition-colors hover:text-primary"
          >返回登录</router-link
        >
      </header>

      <main class="flex flex-grow items-center justify-center">
        <div class="w-full max-w-lg px-4 py-16">
          <div class="flex flex-col gap-8">
            <div class="p-4 text-center">
              <p class="text-4xl font-black leading-tight tracking-[-0.033em]">重置登录密码</p>
              <p class="mt-3 text-base font-normal leading-normal text-[#61896f]">
                验证手机号后设置新密码，完成后将自动登录。仅支持已注册手机号。
              </p>
            </div>

            <div
              v-if="sendHint"
              class="mx-4 rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-3 text-left text-sm font-medium text-emerald-950"
              role="status"
              data-testid="forgot-password-success"
            >
              {{ sendHint }}
            </div>

            <form class="flex flex-col gap-6" @submit.prevent="verifyAndEnter">
              <label class="flex flex-col px-4 py-3">
                <span class="pb-2 text-base font-medium">手机号</span>
                <input
                  v-model="form.phone"
                  type="text"
                  inputmode="numeric"
                  autocomplete="tel"
                  class="h-14 rounded-lg border border-[#dbe6df] bg-white p-[15px] text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/50"
                  placeholder="11 位手机号"
                  data-testid="forgot-password-phone"
                  :disabled="loadingSend || loadingVerify"
                />
              </label>

              <label class="flex flex-col px-4 py-3">
                <span class="pb-2 text-base font-medium">新密码</span>
                <div
                  class="flex w-full min-w-0 items-stretch rounded-lg border border-[#dbe6df] bg-white outline-none transition-[box-shadow,border-color] focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/50 focus-within:ring-offset-0"
                >
                  <input
                    v-model="form.password"
                    :type="showPassword ? 'text' : 'password'"
                    autocomplete="new-password"
                    class="h-14 min-w-0 flex-1 rounded-l-lg border-0 border-r border-[#dbe6df] bg-transparent p-[15px] pr-2 text-base outline-none ring-0 focus:border-transparent focus:ring-0 focus:outline-none"
                    placeholder="至少 8 位"
                    data-testid="forgot-password-password"
                    :disabled="loadingVerify"
                  />
                  <button
                    type="button"
                    class="flex shrink-0 items-center justify-center rounded-r-lg border-0 bg-white px-3 text-[#61896f] !outline-none hover:bg-[#f6f8f6]"
                    :aria-pressed="showPassword"
                    :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                    @click="showPassword = !showPassword"
                  >
                    <span class="material-symbols-outlined text-xl" aria-hidden="true">{{ showPassword ? 'visibility_off' : 'visibility' }}</span>
                  </button>
                </div>
              </label>

              <label class="flex flex-col px-4 py-3">
                <span class="pb-2 text-base font-medium">确认新密码</span>
                <div
                  class="flex w-full min-w-0 items-stretch rounded-lg border border-[#dbe6df] bg-white outline-none transition-[box-shadow,border-color] focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/50 focus-within:ring-offset-0"
                >
                  <input
                    v-model="form.passwordConfirm"
                    :type="showPasswordConfirm ? 'text' : 'password'"
                    autocomplete="new-password"
                    class="h-14 min-w-0 flex-1 rounded-l-lg border-0 border-r border-[#dbe6df] bg-transparent p-[15px] pr-2 text-base outline-none ring-0 focus:border-transparent focus:ring-0 focus:outline-none"
                    placeholder="再次输入新密码"
                    data-testid="forgot-password-password-confirm"
                    :disabled="loadingVerify"
                  />
                  <button
                    type="button"
                    class="flex shrink-0 items-center justify-center rounded-r-lg border-0 bg-white px-3 text-[#61896f] !outline-none hover:bg-[#f6f8f6]"
                    :aria-pressed="showPasswordConfirm"
                    :aria-label="showPasswordConfirm ? '隐藏确认密码' : '显示确认密码'"
                    @click="showPasswordConfirm = !showPasswordConfirm"
                  >
                    <span class="material-symbols-outlined text-xl" aria-hidden="true">{{ showPasswordConfirm ? 'visibility_off' : 'visibility' }}</span>
                  </button>
                </div>
              </label>

              <label class="flex flex-col px-4 py-3">
                <span class="pb-2 text-base font-medium">验证码</span>
                <div class="flex w-full min-w-0 gap-2">
                  <input
                    v-model="form.code"
                    type="text"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    class="h-14 min-w-0 flex-1 rounded-lg border border-[#dbe6df] bg-white p-[15px] text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/50"
                    placeholder="6 位验证码"
                    data-testid="forgot-password-code"
                    :disabled="loadingVerify"
                    @keyup.enter="verifyAndEnter"
                  />
                  <button
                    type="button"
                    class="flex shrink-0 items-center justify-center rounded-lg border border-[#dbe6df] bg-white px-4 text-sm font-bold text-[#111813] transition hover:bg-[#f6f8f6] disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid="forgot-password-send"
                    :disabled="loadingSend || cooldownLeft > 0 || loadingVerify"
                    @click="sendCode"
                  >
                    {{ cooldownLeft > 0 ? `${cooldownLeft}s` : loadingSend ? '发送中…' : '发送验证码' }}
                  </button>
                </div>
                <p
                  v-if="fieldError"
                  class="mt-2 text-sm font-medium text-rose-700"
                  data-testid="forgot-password-field-error"
                >
                  {{ fieldError }}
                </p>
              </label>

              <div class="flex justify-center px-4 py-3">
                <button
                  type="submit"
                  class="flex h-12 w-full max-w-[480px] items-center justify-center rounded-lg bg-primary px-5 text-base font-bold text-[#111813] transition-opacity hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="forgot-password-submit"
                  :disabled="loadingVerify"
                >
                  {{ loadingVerify ? '提交中…' : '重置密码并登录' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>

      <footer class="flex flex-col gap-6 px-5 py-10 text-center">
        <div class="flex flex-wrap items-center justify-center gap-6">
          <a class="min-w-40 text-base font-normal text-[#61896f] transition-colors hover:text-primary"
            >隐私政策</a
          >
          <a class="min-w-40 text-base font-normal text-[#61896f] transition-colors hover:text-primary"
            >服务条款</a
          >
        </div>
        <p class="text-base font-normal text-[#61896f]">© 2024 PlanMaster. All Rights Reserved.</p>
      </footer>
    </div>
  </AuthBackground>
</template>
