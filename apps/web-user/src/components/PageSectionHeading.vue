<script setup lang="ts">
/**
 * 与用户中心 / 帮助页一致的页头：竖向绿条 + 眉标 + 紧凑主标题 + 13px 说明（slot）。
 */
defineProps<{
  /** 眉标，短词、大写间距（如「计划与执行」） */
  kicker: string;
  /** 页面主标题 */
  title: string;
}>();
</script>

<template>
  <div class="flex min-w-0 items-start gap-3">
    <span
      class="mt-1.5 hidden h-9 w-1 shrink-0 rounded-full bg-gradient-to-b from-emerald-400 to-[#0a8f4a] sm:block"
      aria-hidden="true"
    />
    <div class="min-w-0 flex-1">
      <p class="mb-1 text-[10px] font-bold uppercase tracking-[0.28em] text-emerald-800/55">
        {{ kicker }}
      </p>
      <h1 class="text-xl font-bold leading-snug tracking-tight text-[#0f1f16] sm:text-2xl">
        {{ title }}
      </h1>
      <div v-if="$slots.default" class="mt-1.5 max-w-xl text-[13px] leading-relaxed text-[#5a6b62]">
        <slot />
      </div>
    </div>
  </div>
</template>
