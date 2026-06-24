<script setup lang="ts">
defineProps<{
  planDeadline: boolean;
  templateActivity: boolean;
}>();

const emit = defineEmits<{
  'toggle-deadline': [];
  'toggle-template': [];
}>();
</script>

<template>
  <section
    class="settings-panel settings-panel--d2 rounded-[1.25rem] border border-white/80 bg-white/70 p-6 shadow-[0_18px_44px_-32px_rgba(15,50,35,0.35)] ring-1 ring-stone-200/60 backdrop-blur-sm"
  >
    <div class="flex items-center gap-2">
      <span
        class="flex size-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-800 ring-1 ring-amber-500/15"
      >
        <span class="material-symbols-outlined text-[22px]" aria-hidden="true">notifications</span>
      </span>
      <div>
        <h2 class="text-base font-bold text-stone-900">通知</h2>
        <p class="text-xs text-[#7c8a84]">本地偏好，后续可接通知中心。</p>
      </div>
    </div>
    <ul class="mt-5 space-y-1 text-sm">
      <li
        class="flex items-center justify-between gap-3 rounded-xl px-1 py-3 transition hover:bg-stone-50/80"
      >
        <span class="font-medium text-[#2d3d36]">计划截止提醒</span>
        <button
          type="button"
          role="switch"
          class="relative h-8 w-[3.25rem] shrink-0 rounded-full shadow-inner transition-colors duration-300 ease-out"
          :class="planDeadline ? 'bg-[#0a8f4a]' : 'bg-stone-300/90'"
          :aria-checked="planDeadline"
          data-testid="settings-notify-deadline"
          @click="emit('toggle-deadline')"
        >
          <span
            class="absolute top-1 size-6 rounded-full bg-white shadow-md transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
            :style="{
              left: planDeadline ? 'calc(100% - 1.625rem)' : '0.25rem',
            }"
          />
        </button>
      </li>
      <li
        class="flex items-center justify-between gap-3 rounded-xl border-t border-stone-100 px-1 py-3 transition hover:bg-stone-50/80"
      >
        <span class="font-medium text-[#2d3d36]">模板互动</span>
        <button
          type="button"
          role="switch"
          class="relative h-8 w-[3.25rem] shrink-0 rounded-full shadow-inner transition-colors duration-300 ease-out"
          :class="templateActivity ? 'bg-[#0a8f4a]' : 'bg-stone-300/90'"
          :aria-checked="templateActivity"
          data-testid="settings-notify-template"
          @click="emit('toggle-template')"
        >
          <span
            class="absolute top-1 size-6 rounded-full bg-white shadow-md transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
            :style="{
              left: templateActivity ? 'calc(100% - 1.625rem)' : '0.25rem',
            }"
          />
        </button>
      </li>
    </ul>
    <p class="mt-2 text-[11px] leading-snug text-[#8a9a92]">点赞、收藏等摘要提醒（占位）。</p>
  </section>
</template>
