<script setup lang="ts">
import AuthOtpCaptchaBlock from "../../../components/auth/AuthOtpCaptchaBlock.vue";
import type { AuthOtpForm } from "../composables/useAuthOtpFlow";

defineProps<{
  form: AuthOtpForm;
  otpCaptchaImageUrl: string;
  otpCaptchaLoading: boolean;
  loadingSend: boolean;
  cooldownLeft: number;
}>();

const emit = defineEmits<{
  sendCode: [];
  refreshCaptcha: [];
  openSmsHelp: [];
}>();
</script>

<template>
  <AuthOtpCaptchaBlock
    v-model:captcha-text="form.captchaText"
    :image-url="otpCaptchaImageUrl"
    :loading="otpCaptchaLoading"
    refresh-test-id="captcha-refresh-login-otp"
    @refresh="emit('refreshCaptcha')"
  />
  <div class="flex flex-col">
    <label for="login-code-otp" class="pb-2 text-sm font-medium">验证码</label>
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
        @click="emit('sendCode')"
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
      @click="emit('openSmsHelp')"
    >
      收不到验证码？
    </button>
  </div>
</template>
