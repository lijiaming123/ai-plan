<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  open: boolean;
  variant?: "detail" | "draft";
  slotKey: string;
  content: string;
  version?: number | null;
  saving?: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  "update:content": [value: string];
  save: [];
  close: [];
}>();

const isDraftVariant = computed(() => props.variant === "draft");

const testId = computed(() =>
  isDraftVariant.value ? "draft-schedule-edit-dialog" : "schedule-edit-dialog",
);

const contentModel = computed({
  get: () => props.content,
  set: (v: string) => emit("update:content", v),
});

function close() {
  emit("update:open", false);
  emit("close");
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
      :class="
        isDraftVariant
          ? 'draft-modal-backdrop'
          : 'bg-black/40'
      "
      :data-testid="testId"
      role="dialog"
      aria-modal="true"
      @click.self="close"
    >
      <div
        class="w-full max-w-xl rounded-2xl p-6 shadow-xl"
        :class="
          isDraftVariant
            ? 'draft-modal-panel border border-[#d5e8df] bg-[linear-gradient(165deg,#ffffff_0%,#f6fcf9_100%)] shadow-[0_24px_64px_-24px_rgba(18,74,49,0.45)]'
            : 'bg-white'
        "
        @click.stop
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2
              v-if="isDraftVariant"
              class="text-base font-black tracking-tight text-[#111813]"
            >
              编辑打卡内容
            </h2>
            <h3 v-else class="text-base font-bold">编辑打卡内容</h3>
            <p class="mt-1 text-xs font-semibold text-[#61896f]">
              <template v-if="isDraftVariant">
                版本 v{{ version ?? "—" }} · 打卡段：{{ slotKey }}
              </template>
              <template v-else>打卡段：{{ slotKey }}</template>
            </p>
          </div>
          <button
            type="button"
            :class="
              isDraftVariant
                ? 'draft-btn draft-btn--ghost h-9 px-3'
                : 'rounded-lg px-3 py-1.5 text-xs font-semibold text-[#61896f] hover:bg-white/60'
            "
            @click="close"
          >
            关闭
          </button>
        </div>
        <textarea
          v-model="contentModel"
          :rows="isDraftVariant ? 7 : 6"
          class="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm leading-relaxed"
          :class="isDraftVariant ? 'bg-white' : ''"
          placeholder="仅编辑内容文本，不改变 slotKey"
        />
        <div
          class="flex justify-end gap-2"
          :class="isDraftVariant ? 'mt-6' : 'mt-5'"
        >
          <button
            type="button"
            :class="
              isDraftVariant
                ? 'draft-btn draft-btn--ghost h-10 px-4'
                : 'rounded-lg px-4 py-2 text-sm font-semibold text-[#61896f]'
            "
            :disabled="saving"
            @click="close"
          >
            取消
          </button>
          <button
            type="button"
            :class="
              isDraftVariant
                ? 'draft-btn draft-btn--primary h-10 px-4 disabled:opacity-60'
                : 'rounded-lg bg-[#111813] px-4 py-2 text-sm font-bold text-white disabled:opacity-50'
            "
            :disabled="saving"
            data-testid="schedule-edit-save"
            @click="emit('save')"
          >
            {{ saving ? "保存中…" : "保存" }}
          </button>
        </div>
      </div>
    </div>
</template>
