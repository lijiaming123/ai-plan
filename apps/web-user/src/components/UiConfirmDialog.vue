<script setup lang="ts">
import { computed, watch, type PropType } from "vue";
import { useCloseOnEscape } from "../composables/useCloseOnEscape";

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  title: { type: String, default: "确认操作" },
  description: { type: String, default: "" },
  confirmText: { type: String, default: "确定" },
  cancelText: { type: String, default: "取消" },
  danger: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  closeOnConfirm: { type: Boolean, default: true },
  maxWidthClass: { type: String as PropType<string>, default: "max-w-lg" },
});

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "confirm"): void;
  (e: "cancel"): void;
}>();

const open = computed(() => props.modelValue);

function close() {
  emit("update:modelValue", false);
}

function onCancel() {
  emit("cancel");
  close();
}

function onConfirm() {
  emit("confirm");
  if (props.closeOnConfirm) close();
}

useCloseOnEscape(open, () => {
  if (!props.loading) close();
});

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return;
    // 防止背景滚动（轻量处理：只在打开时锁定）
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const restore = () => {
      document.body.style.overflow = prev;
      window.removeEventListener("beforeunload", restore);
    };
    window.addEventListener("beforeunload", restore);
    // 关闭时还原
    const stop = watch(
      () => props.modelValue,
      (next) => {
        if (next) return;
        restore();
        stop();
      },
    );
  },
);
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    data-testid="ui-confirm-dialog"
    @click.self="!loading && close()"
  >
    <div
      class="max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      :class="maxWidthClass"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      @click.stop
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 class="text-lg font-extrabold text-stone-900">{{ title }}</h3>
          <slot name="description">
            <p v-if="description" class="mt-1 text-sm text-stone-600">
              {{ description }}
            </p>
          </slot>
        </div>
        <button
          type="button"
          class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-stone-100 text-stone-700 ring-1 ring-stone-200/80 transition hover:bg-stone-200/70 disabled:opacity-60"
          aria-label="关闭"
          data-testid="ui-confirm-close"
          :disabled="loading"
          @click="close"
        >
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true"
            >close</span
          >
        </button>
      </div>

      <div class="mt-6 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg px-4 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-50 disabled:opacity-60"
          data-testid="ui-confirm-cancel"
          :disabled="loading"
          @click="onCancel"
        >
          {{ cancelText }}
        </button>
        <button
          type="button"
          class="rounded-lg px-4 py-2 text-sm font-extrabold text-white disabled:opacity-60"
          :class="danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#111813] hover:bg-[#0d1410]'"
          data-testid="ui-confirm-ok"
          :disabled="loading"
          @click="onConfirm"
        >
          {{ loading ? "处理中…" : confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

