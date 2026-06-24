<script setup lang="ts">
defineProps<{
  open: boolean;
  planTitle: string;
}>();

const emit = defineEmits<{
  close: [];
  archive: [];
  delete: [];
}>();
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50"
    data-testid="plan-action-sheet-root"
    @click="emit('close')"
  >
    <div
      class="absolute inset-0 bg-stone-900/30 backdrop-blur-[1px]"
      aria-hidden="true"
    />
    <div
      class="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-lg rounded-t-3xl border border-white/60 bg-white/95 px-4 pb-5 pt-4 shadow-[0_-20px_55px_-35px_rgba(10,60,38,0.55)]"
      role="dialog"
      aria-modal="true"
      aria-label="计划操作"
      data-testid="plan-action-sheet"
      @click.stop
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-stone-500">对该计划进行操作</p>
          <p class="mt-1 truncate text-base font-extrabold text-stone-900">
            {{ planTitle }}
          </p>
        </div>
        <button
          type="button"
          class="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-stone-100 text-stone-700 ring-1 ring-stone-200/80 transition hover:bg-stone-200/70"
          aria-label="关闭"
          data-testid="action-sheet-close"
          @click="emit('close')"
        >
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true"
            >close</span
          >
        </button>
      </div>

      <div class="mt-4 space-y-2">
        <button
          type="button"
          class="flex w-full items-center justify-between rounded-2xl border border-slate-200/70 bg-slate-50/90 px-4 py-3 text-left text-sm font-extrabold text-slate-700 ring-1 ring-white/70 transition hover:bg-slate-50"
          data-testid="action-archive"
          @click="emit('archive')"
        >
          <span>归档计划</span>
          <span class="text-xs font-semibold text-slate-600/80">只读</span>
        </button>
        <button
          type="button"
          class="flex w-full items-center justify-between rounded-2xl border border-rose-200/60 bg-rose-50/80 px-4 py-3 text-left text-sm font-extrabold text-rose-700 ring-1 ring-white/70 transition hover:bg-rose-50"
          data-testid="action-delete"
          @click="emit('delete')"
        >
          <span>删除计划</span>
          <span class="text-xs font-semibold text-rose-700/70"
            >可在最近删除恢复</span
          >
        </button>

        <button
          type="button"
          class="w-full rounded-2xl bg-stone-900/6 px-4 py-3 text-sm font-extrabold text-stone-700 ring-1 ring-white/70 transition hover:bg-stone-900/10"
          data-testid="action-cancel"
          @click="emit('close')"
        >
          取消
        </button>
      </div>
    </div>
  </div>
</template>
