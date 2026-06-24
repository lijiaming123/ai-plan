<script setup lang="ts">
import AuthPasswordField from "../../../components/auth/AuthPasswordField.vue";
import type { AuthOtpForm } from "../composables/useAuthOtpFlow";

defineProps<{
  form: AuthOtpForm;
}>();
</script>

<template>
  <AuthPasswordField
    id="login-password-only"
    v-model="form.password"
    label="密码"
    placeholder="请输入密码"
    autocomplete="current-password"
    aria-label="密码"
  />
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
