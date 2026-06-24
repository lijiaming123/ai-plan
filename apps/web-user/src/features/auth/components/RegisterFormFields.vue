<script setup lang="ts">
import AuthOtpCaptchaBlock from "../../../components/auth/AuthOtpCaptchaBlock.vue";
import AuthPasswordField from "../../../components/auth/AuthPasswordField.vue";
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
}>();
</script>

<template>
  <AuthPasswordField
    id="reg-password"
    v-model="form.password"
    label="密码"
    placeholder="至少 8 位"
    autocomplete="new-password"
    aria-label="密码"
  />
  <AuthPasswordField
    id="reg-password-confirm"
    v-model="form.passwordConfirm"
    label="确认密码"
    placeholder="再次输入密码"
    autocomplete="new-password"
    aria-label="确认密码"
  />
  <AuthOtpCaptchaBlock
    v-model:captcha-text="form.captchaText"
    :image-url="otpCaptchaImageUrl"
    :loading="otpCaptchaLoading"
    @refresh="emit('refreshCaptcha')"
  />
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
</template>
