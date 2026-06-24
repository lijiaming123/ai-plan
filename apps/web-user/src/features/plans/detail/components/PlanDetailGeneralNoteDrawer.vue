<script setup lang="ts">
defineProps<{
  content: string;
  saving: boolean;
}>();

const emit = defineEmits<{
  "update:content": [value: string];
  submit: [];
}>();
</script>

<template>
  <section
    class="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_10px_24px_-20px_rgba(12,72,48,0.2)]"
    data-testid="general-note-composer"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-sm font-extrabold text-[#0f1f16]">添加备注</p>
        <p class="mt-1 text-xs leading-relaxed text-[#61896f]">
          可选写一句话（不支持附件/链接）；不影响完成状态。
        </p>
      </div>
      <button
        type="button"
        class="shrink-0 rounded-xl bg-[#111813] px-4 py-2 text-xs font-bold text-white hover:bg-[#0d1410] disabled:opacity-50"
        :disabled="saving"
        data-testid="general-note-submit"
        @click="emit('submit')"
      >
        {{ saving ? "提交中…" : "提交" }}
      </button>
    </div>

    <div class="mt-4">
      <label class="text-xs font-bold text-[#2a3832]" for="general-note">
        备注
      </label>
      <textarea
        id="general-note"
        :value="content"
        rows="3"
        class="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-relaxed text-[#111813] placeholder:text-slate-400 focus:border-[#4d7a63] focus:outline-none focus:ring-1 focus:ring-[#4d7a63]/40"
        placeholder="例如：今天按时完成了最小行动。"
        @input="
          emit('update:content', ($event.target as HTMLTextAreaElement).value)
        "
      />
    </div>
  </section>
</template>
