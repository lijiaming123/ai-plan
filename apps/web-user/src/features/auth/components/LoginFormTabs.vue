<script setup lang="ts">
defineProps<{
  isRegisterMode: boolean;
  loginMethod: "otp" | "password";
}>();

const emit = defineEmits<{
  setLoginMethod: [method: "otp" | "password"];
}>();
</script>

<template>
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
        @click="emit('setLoginMethod', 'password')"
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
        @click="emit('setLoginMethod', 'otp')"
      >
        改用验证码登录
      </button>
    </template>
  </p>
</template>
