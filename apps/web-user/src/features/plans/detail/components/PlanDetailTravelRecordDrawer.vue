<script setup lang="ts">
defineProps<{
  content: string;
  uploadedFiles: Array<{ url: string; fileName: string }>;
  manualLinks: Array<{ url: string; fileName: string }>;
  saving: boolean;
  fileUploading: boolean;
  dropActive: boolean;
  uploadProgress: string;
  onDropActive: (active: boolean) => void;
  onDrop: (event: DragEvent) => void;
}>();

const emit = defineEmits<{
  "update:content": [value: string];
  submit: [];
  filesPicked: [files: FileList | null];
  removeUploaded: [index: number];
  removeManualRow: [index: number];
  addManualLinkRow: [];
}>();
</script>

<template>
  <section
    class="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_10px_24px_-20px_rgba(12,72,48,0.2)]"
    data-testid="travel-record-composer"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-sm font-extrabold text-[#0f1f16]">添加记录</p>
        <p class="mt-1 text-xs leading-relaxed text-[#61896f]">
          可选填文字说明、上传附件或添加链接（至少填一项）。
        </p>
      </div>
      <button
        type="button"
        class="shrink-0 rounded-xl bg-[#111813] px-4 py-2 text-xs font-bold text-white hover:bg-[#0d1410] disabled:opacity-50"
        :disabled="saving || fileUploading"
        data-testid="travel-record-submit"
        @click="emit('submit')"
      >
        {{ saving ? "提交中…" : "提交" }}
      </button>
    </div>

    <div class="mt-4">
      <p class="text-xs font-bold text-[#2a3832]">上传附件</p>
      <label
        class="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition"
        :class="
          dropActive
            ? 'border-[#0a8f4a] bg-emerald-50/70 ring-2 ring-[#0a8f4a]/25'
            : 'border-[#c5d9ce] bg-[#fbfcfb] hover:border-[#8fbc9f] hover:bg-[#f4f9f6]'
        "
        @dragenter.prevent="onDropActive(true)"
        @dragover.prevent="onDropActive(true)"
        @dragleave.prevent="onDropActive(false)"
        @drop.prevent="onDrop($event)"
      >
        <span class="text-sm font-semibold text-[#1a3d2e]">
          {{
            fileUploading
              ? uploadProgress
                ? `正在上传 ${uploadProgress}…`
                : "正在上传…"
              : "将文件拖到这里，或点击选择"
          }}
        </span>
        <span class="mt-1.5 text-xs text-[#61896f]">
          支持多文件；单文件不超过 15MB
        </span>
        <input
          type="file"
          class="sr-only"
          multiple
          accept="image/*"
          data-testid="travel-record-upload-input"
          :disabled="fileUploading"
          @change="
            emit('filesPicked', ($event.target as HTMLInputElement).files);
            ($event.target as HTMLInputElement).value = '';
          "
        />
      </label>

      <ul
        v-if="uploadedFiles.length > 0"
        class="mt-3 flex flex-wrap gap-2"
        aria-label="已上传的附件"
      >
        <li
          v-for="(row, idx) in uploadedFiles"
          :key="`travel-up-${idx}-${row.url}`"
          class="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-white py-1 pl-2.5 pr-1 text-xs font-medium text-[#2a3832] shadow-sm"
        >
          <span
            class="max-w-[200px] truncate"
            :title="row.fileName || row.url"
            >{{ row.fileName || "附件" }}</span
          >
          <button
            type="button"
            class="rounded-full p-0.5 text-[#61896f] hover:bg-slate-100 hover:text-[#7b2f28]"
            :aria-label="`移除 ${row.fileName || '附件'}`"
            @click="emit('removeUploaded', idx)"
          >
            ×
          </button>
        </li>
      </ul>
    </div>

    <div class="mt-4">
      <label class="text-xs font-bold text-[#2a3832]" for="travel-record-note"
        >文字说明</label
      >
      <textarea
        id="travel-record-note"
        :value="content"
        rows="3"
        class="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-relaxed text-[#111813] placeholder:text-slate-400 focus:border-[#4d7a63] focus:outline-none focus:ring-1 focus:ring-[#4d7a63]/40"
        placeholder="补充本段旅行的记录（可选）。"
        @input="
          emit('update:content', ($event.target as HTMLTextAreaElement).value)
        "
      />
    </div>

    <details
      class="checkin-link-details mt-4 rounded-xl border border-slate-200/90 bg-[#fbfcfb]"
    >
      <summary
        class="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-[#2a3832] marker:content-none [&::-webkit-details-marker]:hidden"
      >
        <span class="inline-flex items-center gap-2">
          <span class="checkin-details-chevron text-[#61896f]">▸</span>
          添加链接
        </span>
      </summary>
      <div class="border-t border-slate-100 px-3 pb-3 pt-1">
        <p class="mb-2 text-xs text-[#61896f]">
          填写可访问的 https 链接；显示名称仅作展示。
        </p>
        <div class="space-y-2">
          <div
            v-for="(row, idx) in manualLinks"
            :key="`travel-link-${idx}`"
            class="flex flex-col gap-2 sm:flex-row sm:items-center"
          >
            <input
              v-model="row.url"
              type="url"
              class="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="https://…"
              inputmode="url"
            />
            <div class="flex shrink-0 items-center gap-2 sm:w-auto">
              <input
                v-model="row.fileName"
                type="text"
                class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm sm:w-36"
                placeholder="显示名（可选）"
              />
              <button
                v-if="manualLinks.length > 1"
                type="button"
                class="rounded-lg px-2 py-1.5 text-xs font-semibold text-[#61896f] hover:bg-slate-100"
                @click="emit('removeManualRow', idx)"
              >
                删行
              </button>
            </div>
          </div>
        </div>
        <button
          type="button"
          class="mt-2 text-xs font-bold text-[#0f8b4e] hover:underline"
          @click="emit('addManualLinkRow')"
        >
          + 再加一行链接
        </button>
      </div>
    </details>
  </section>
</template>

<style scoped>
.checkin-link-details[open] .checkin-details-chevron {
  display: inline-block;
  transform: rotate(90deg);
}
</style>
