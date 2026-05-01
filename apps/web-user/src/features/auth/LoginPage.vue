<script setup lang="ts">
import { computed, onUnmounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getApiClient, HttpApiError, type OtpPurpose } from '../../lib/api-client';
import { trackEvent } from '../../lib/telemetry';
import { setAuthTier, setAuthToken, setUserPhone } from '../../stores/auth';
import AuthBackground from './AuthBackground.vue';
import UiErrorToast from '../../components/UiErrorToast.vue';

const router = useRouter();
const route = useRoute();
const isRegisterMode = computed(() => route.name === 'register');

const purpose = computed<OtpPurpose>(() => (isRegisterMode.value ? 'register' : 'login'));

const form = reactive({
  phone: '',
  code: '',
});

const loadingSend = ref(false);
const loadingVerify = ref(false);
const cooldownLeft = ref(0);
let cooldownTimer: number | null = null;

const errorMessage = ref('');
const errorToastMessage = ref('');

const pageTitle = computed(() => (isRegisterMode.value ? '创建你的账号' : '欢迎回来'));
const pageSubtitle = computed(() =>
  isRegisterMode.value ? '手机号验证后即可开始' : '使用短信验证码快速登录',
);
const primaryActionText = computed(() =>
  isRegisterMode.value ? '验证并开始' : '验证并进入',
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

async function verifyAndLogin() {
  errorToastMessage.value = '';
  if (!validatePhone()) return;
  if (!validateCode()) return;
  loadingVerify.value = true;
  try {
    const r = await getApiClient().verifyOtp({
      phone: form.phone.trim(),
      code: form.code.trim(),
      purpose: purpose.value,
    });
    setAuthToken(r.token);
    setUserPhone(r.phone);
    setAuthTier('basic');
    trackEvent('auth_login', { properties: { method: 'otp', purpose: purpose.value } });
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
    <div class="flex min-h-screen w-full flex-col items-center justify-center p-4">
      <div class="w-full max-w-md">
      <div class="mb-8 text-center">
        <h1 class="pb-2 text-[32px] font-bold leading-tight tracking-tight">计划大师</h1>
        <h2 class="pb-2 text-2xl font-bold leading-tight tracking-tight">{{ pageTitle }}</h2>
        <p class="text-base font-normal text-[#61896f]">{{ pageSubtitle }}</p>
      </div>

      <div class="w-full rounded-xl border border-[#dbe6df] bg-white p-8 shadow-sm">
        <div class="flex pb-6">
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

        <form class="space-y-6" @submit.prevent="verifyAndLogin">
          <div class="flex flex-col">
            <label for="login-phone" class="pb-2 text-sm font-medium">手机号</label>
            <input
              id="login-phone"
              v-model="form.phone"
              type="text"
              inputmode="numeric"
              autocomplete="tel"
              aria-label="手机号"
              class="h-12 rounded-lg border border-[#dbe6df] bg-white p-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 focus:ring-offset-0"
              placeholder="请输入 11 位手机号"
            />
          </div>

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

          <div v-if="!isRegisterMode" class="flex justify-end pt-1">
            <router-link to="/auth/forgot-password" class="text-sm font-medium text-primary/80 transition-colors hover:text-primary">
              收不到验证码？
            </router-link>
          </div>

          <p v-if="errorMessage" class="text-sm font-medium text-[#c0392b] dark:text-[#ff8e85]">{{ errorMessage }}</p>

          <button
            class="flex h-12 w-full items-center justify-center rounded-lg bg-primary px-6 text-base font-bold text-black transition-all hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            data-testid="otp-verify"
            :disabled="loadingVerify"
          >
            {{ loadingVerify ? '验证中…' : primaryActionText }}
          </button>
        </form>

        <p class="mt-6 text-center text-xs text-[#61896f]">
          商业化普通版默认使用手机号验证码登录；生产环境需接入短信服务。
        </p>
      </div>
    </div>
    </div>
  </AuthBackground>
</template>
