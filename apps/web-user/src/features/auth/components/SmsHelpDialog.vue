<script setup lang="ts">
import UiModalShell from "../../../components/UiModalShell.vue";

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <UiModalShell
    :open="open"
    title-id="login-sms-help-title"
    title="收不到验证码？"
    test-id="login-sms-help"
    @close="emit('close')"
  >
    <ul class="list-disc space-y-2 pl-5 text-sm leading-relaxed text-stone-600">
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
        @click="emit('close')"
        >忘记密码</router-link
      >
      。
    </p>
    <template #footer>
      <button
        type="button"
        class="rounded-lg bg-[#111813] px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#0d1410]"
        @click="emit('close')"
      >
        知道了
      </button>
    </template>
  </UiModalShell>
</template>
