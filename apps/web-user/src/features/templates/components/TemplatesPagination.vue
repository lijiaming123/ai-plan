<script setup lang="ts">
defineProps<{
  pageLabel: string;
  canPrev: boolean;
  canNext: boolean;
  loading: boolean;
}>();

const emit = defineEmits<{
  prev: [];
  next: [];
}>();
</script>

<template>
  <div class="flex items-center justify-end gap-2" aria-label="分页">
    <button
      type="button"
      class="rounded-2xl border border-stone-200/80 bg-white/70 px-3 py-2 text-sm font-bold text-stone-800 ring-1 ring-white/70 transition hover:bg-white disabled:opacity-50"
      data-testid="page-prev"
      :disabled="!canPrev || loading"
      @click="emit('prev')"
    >
      上一页
    </button>
    <span class="text-sm font-semibold text-stone-500">{{ pageLabel }}</span>
    <button
      type="button"
      class="rounded-2xl border border-stone-200/80 bg-white/70 px-3 py-2 text-sm font-bold text-stone-800 ring-1 ring-white/70 transition hover:bg-white disabled:opacity-50"
      data-testid="page-next"
      :disabled="!canNext || loading"
      @click="emit('next')"
    >
      下一页
    </button>
  </div>
</template>
