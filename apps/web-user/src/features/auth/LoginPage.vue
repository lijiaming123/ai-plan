<script setup lang="ts">
import AuthBackground from "./AuthBackground.vue";
import AuthLegalFooter from "../legal/AuthLegalFooter.vue";
import { LEGAL_ROUTES } from "../../lib/legal-meta";
import UiErrorToast from "../../components/UiErrorToast.vue";
import LoginFormTabs from "./components/LoginFormTabs.vue";
import RegisterFormFields from "./components/RegisterFormFields.vue";
import OtpLoginFields from "./components/OtpLoginFields.vue";
import PasswordLoginFields from "./components/PasswordLoginFields.vue";
import SmsHelpDialog from "./components/SmsHelpDialog.vue";
import { useLoginPage } from "./composables/useLoginPage";

const {
  isRegisterMode,
  loginMethod,
  form,
  showSmsHelp,
  errorMessage,
  errorToastMessage,
  clearError,
  agreedToLegal,
  otpCaptchaImageUrl,
  otpCaptchaLoading,
  refreshOtpCaptcha,
  loadingSend,
  cooldownLeft,
  sendCode,
  pageTitle,
  pageSubtitle,
  primaryActionText,
  primaryLoading,
  formPanelKey,
  submitForm,
  setLoginMethod,
} = useLoginPage();
</script>

<template>
  <AuthBackground>
    <UiErrorToast :message="errorToastMessage" @close="clearError" />
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
          <LoginFormTabs
            :is-register-mode="isRegisterMode"
            :login-method="loginMethod"
            @set-login-method="setLoginMethod"
          />

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
                <RegisterFormFields
                  v-if="isRegisterMode"
                  :form="form"
                  :otp-captcha-image-url="otpCaptchaImageUrl"
                  :otp-captcha-loading="otpCaptchaLoading"
                  :loading-send="loadingSend"
                  :cooldown-left="cooldownLeft"
                  @send-code="sendCode"
                  @refresh-captcha="refreshOtpCaptcha()"
                />
                <PasswordLoginFields
                  v-else-if="loginMethod === 'password'"
                  :form="form"
                />
                <OtpLoginFields
                  v-else
                  :form="form"
                  :otp-captcha-image-url="otpCaptchaImageUrl"
                  :otp-captcha-loading="otpCaptchaLoading"
                  :loading-send="loadingSend"
                  :cooldown-left="cooldownLeft"
                  @send-code="sendCode"
                  @refresh-captcha="refreshOtpCaptcha()"
                  @open-sms-help="showSmsHelp = true"
                />
              </div>
            </Transition>

            <p
              v-if="errorMessage"
              class="text-sm font-medium text-[#c0392b] dark:text-[#ff8e85]"
            >
              {{ errorMessage }}
            </p>

            <label
              v-if="isRegisterMode"
              class="flex cursor-pointer items-start gap-3 rounded-lg border border-[#dbe6df] bg-[#fafcfb] p-3 text-sm leading-relaxed text-stone-600"
              data-testid="register-legal-consent"
            >
              <input
                v-model="agreedToLegal"
                type="checkbox"
                class="mt-0.5 size-4 shrink-0 rounded border-stone-300 text-primary focus:ring-primary/40"
              />
              <span>
                我已阅读并同意
                <router-link
                  :to="LEGAL_ROUTES.terms"
                  class="font-semibold text-[#0a8f4a] underline decoration-emerald-300 underline-offset-2"
                  target="_blank"
                  @click.stop
                  >《用户协议》</router-link
                >
                和
                <router-link
                  :to="LEGAL_ROUTES.privacy"
                  class="font-semibold text-[#0a8f4a] underline decoration-emerald-300 underline-offset-2"
                  target="_blank"
                  @click.stop
                  >《隐私政策》</router-link
                >
              </span>
            </label>

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

      <AuthLegalFooter />
    </div>

    <SmsHelpDialog :open="showSmsHelp" @close="showSmsHelp = false" />
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
