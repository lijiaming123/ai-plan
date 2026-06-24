<script setup lang="ts">
const captchaText = defineModel<string>("captchaText", { required: true });

withDefaults(
  defineProps<{
    imageUrl: string;
    loading?: boolean;
    refreshTestId?: string;
    captchaInputTestId?: string;
    disabled?: boolean;
  }>(),
  {
    refreshTestId: "captcha-refresh",
  },
);

const emit = defineEmits<{
  refresh: [];
}>();
</script>

<template>
  <div
    class="flex flex-col gap-2 rounded-lg border border-[#dbe6df] bg-[#fafcfb] p-3"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-sm font-medium text-[#111813]">图形验证码</span>
      <button
        type="button"
        class="text-sm font-semibold text-primary/90 underline decoration-primary/30 underline-offset-2 transition hover:text-primary hover:decoration-primary"
        :data-testid="refreshTestId"
        :disabled="loading"
        @click="emit('refresh')"
      >
        {{ loading ? "加载中…" : "换一张" }}
      </button>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <img
        v-if="imageUrl"
        :src="imageUrl"
        alt="图形验证码"
        width="132"
        height="44"
        class="h-11 rounded border border-[#dbe6df] bg-white object-contain"
      />
      <input
        v-model="captchaText"
        type="text"
        maxlength="12"
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
        aria-label="图形验证码"
        :data-testid="captchaInputTestId"
        :disabled="disabled"
        class="h-12 w-[8.5rem] rounded-lg border border-[#dbe6df] bg-white px-3 text-base uppercase outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 focus:ring-offset-0"
        placeholder="图中字符"
      />
    </div>
  </div>
</template>
