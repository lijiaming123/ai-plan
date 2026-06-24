<script setup lang="ts">
import AuthBackground from "./AuthBackground.vue";
import AuthLegalFooter from "../legal/AuthLegalFooter.vue";
import UiErrorToast from "../../components/UiErrorToast.vue";
import AuthOtpCaptchaBlock from "../../components/auth/AuthOtpCaptchaBlock.vue";
import AuthPasswordField from "../../components/auth/AuthPasswordField.vue";
import { useForgotPasswordReset } from "./composables/useForgotPasswordReset";

const {
  form,
  fieldError,
  sendHint,
  errorToastMessage,
  clearError,
  loadingVerify,
  loadingSend,
  cooldownLeft,
  otpCaptchaImageUrl,
  otpCaptchaLoading,
  refreshOtpCaptcha,
  sendCode,
  verifyAndEnter,
} = useForgotPasswordReset();
</script>

<template>
  <AuthBackground>
    <UiErrorToast :message="errorToastMessage" @close="clearError" />
    <div class="mx-auto flex w-full max-w-[960px] flex-1 flex-col px-4 py-5">
      <header
        class="flex items-center justify-between border-b border-b-[#f0f4f2] px-10 py-3"
      >
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
              <p class="text-4xl font-black leading-tight tracking-[-0.033em]">
                重置登录密码
              </p>
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

              <div class="px-4 py-3">
                <AuthPasswordField
                  v-model="form.password"
                  label="新密码"
                  placeholder="至少 8 位"
                  autocomplete="new-password"
                  test-id="forgot-password-password"
                  input-class="h-14"
                  :disabled="loadingVerify"
                />
              </div>

              <div class="px-4 py-3">
                <AuthPasswordField
                  v-model="form.passwordConfirm"
                  label="确认新密码"
                  placeholder="再次输入新密码"
                  autocomplete="new-password"
                  aria-label="确认新密码"
                  test-id="forgot-password-password-confirm"
                  input-class="h-14"
                  :disabled="loadingVerify"
                />
              </div>

              <div class="mx-4">
                <AuthOtpCaptchaBlock
                  v-model:captcha-text="form.captchaText"
                  :image-url="otpCaptchaImageUrl"
                  :loading="otpCaptchaLoading"
                  refresh-test-id="forgot-captcha-refresh"
                  captcha-input-test-id="forgot-password-captcha-text"
                  :disabled="loadingVerify"
                  @refresh="refreshOtpCaptcha()"
                />
              </div>

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
                    {{
                      cooldownLeft > 0
                        ? `${cooldownLeft}s`
                        : loadingSend
                          ? "发送中…"
                          : "发送验证码"
                    }}
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
                  {{ loadingVerify ? "提交中…" : "重置密码并登录" }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>

      <AuthLegalFooter />
    </div>
  </AuthBackground>
</template>
