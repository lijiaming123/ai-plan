<script setup lang="ts">
defineProps<{
  open: boolean;
  titleId: string;
  title: string;
  testId?: string;
  maxWidthClass?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    :data-testid="testId ? `${testId}-overlay` : undefined"
    role="presentation"
    @click.self="emit('close')"
  >
    <div
      class="max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      :class="maxWidthClass ?? 'max-w-md'"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      :data-testid="testId"
      @click.stop
    >
      <div class="flex items-start justify-between gap-3">
        <h3 :id="titleId" class="text-lg font-extrabold text-stone-900">
          {{ title }}
        </h3>
        <button
          type="button"
          class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-700 ring-1 ring-stone-200/80 transition hover:bg-stone-200/70"
          aria-label="关闭"
          @click="emit('close')"
        >
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
        </button>
      </div>
      <div class="mt-4">
        <slot />
      </div>
      <div v-if="$slots.footer" class="mt-6 flex justify-end gap-2">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>
