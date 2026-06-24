<script setup lang="ts">
import { computed, toValue } from "vue";
import type { CheckinPublicReview } from "../../../../lib/api-client";

const props = defineProps<{
  open: boolean;
  slotKey: string;
  slotPlanText: string;
  content: string;
  uploadedFiles: Array<{ url: string; fileName: string }>;
  manualLinks: Array<{ url: string; fileName: string }>;
  saving: boolean;
  fileUploading: boolean;
  dropActive: boolean;
  uploadProgress: string;
  review: CheckinPublicReview | null;
  appealText: string;
  appealSubmitting: boolean;
  isTravelPlan: boolean;
  checkinBandLabel: (
    band: CheckinPublicReview["dimensions"][number]["band"],
  ) => string;
  onDropActive: (active: boolean) => void;
  onDrop: (event: DragEvent) => void;
}>();

const resolvedSlotPlanText = computed(() =>
  String(toValue(props.slotPlanText as string) ?? ""),
);

const emit = defineEmits<{
  "update:open": [value: boolean];
  "update:content": [value: string];
  "update:appealText": [value: string];
  submit: [];
  submitAppeal: [];
  filesPicked: [files: FileList | null];
  removeUploaded: [index: number];
  removeManualRow: [index: number];
  addManualLinkRow: [];
}>();

function close() {
  emit("update:open", false);
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4"
    data-testid="schedule-checkin-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="schedule-checkin-title"
    @click.self="close"
  >
    <div
      class="flex max-h-[min(88vh,700px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200/80"
      @click.stop
    >
      <header
        class="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4"
      >
        <div class="min-w-0">
          <h3
            id="schedule-checkin-title"
            class="text-base font-bold tracking-tight text-[#0f1f16]"
          >
            提交完成证明
          </h3>
          <p class="mt-1 font-mono text-[11px] font-semibold text-[#61896f]">
            打卡段 {{ slotKey }}
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium text-[#61896f] hover:bg-slate-100"
          aria-label="关闭"
          @click="close"
        >
          关闭
        </button>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <p
          class="mb-4 rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 py-2.5 text-xs leading-relaxed text-[#4a5c52]"
          data-testid="schedule-checkin-privacy-note"
        >
          说明、链接与上传文件会随本期打卡一起保存。核验会综合参考文字与材料；除你本人外，材料仅经后端处理，不会公开展示于其他用户端。
        </p>
        <section
          v-if="resolvedSlotPlanText.trim()"
          class="rounded-xl border border-slate-200/90 bg-[#f8faf9] p-3 sm:p-3.5"
        >
          <p
            class="text-[11px] font-bold uppercase tracking-[0.12em] text-[#61896f]"
          >
            本期计划（对照）
          </p>
          <p
            class="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-[#1a2e24]"
          >
            {{ resolvedSlotPlanText }}
          </p>
        </section>

        <section class="mt-4" :class="{ 'mt-3': resolvedSlotPlanText.trim() }">
          <div class="flex items-baseline justify-between gap-2">
            <div>
              <p class="text-sm font-bold text-[#142820]">上传附件</p>
              <p class="mt-0.5 text-xs text-[#61896f]">
                推荐：图片、PDF、Word、文本等，可多选
              </p>
            </div>
          </div>
          <label
            class="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition sm:py-9"
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
            <span class="mt-1.5 text-xs text-[#61896f]"
              >支持多文件；单文件不超过 15MB</span
            >
            <input
              type="file"
              class="sr-only"
              multiple
              accept="image/*,.pdf,.doc,.docx,.txt,.md,.csv"
              data-testid="schedule-checkin-upload-input"
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
              :key="`up-${idx}-${row.url}`"
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
        </section>

        <section class="mt-5">
          <label
            for="schedule-checkin-note"
            class="text-sm font-bold text-[#142820]"
            >完成说明</label
          >
          <textarea
            id="schedule-checkin-note"
            :value="content"
            rows="4"
            class="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-relaxed text-[#111813] placeholder:text-slate-400 focus:border-[#4d7a63] focus:outline-none focus:ring-1 focus:ring-[#4d7a63]/40"
            placeholder="简要说明本期完成情况；无文字时请至少上传一个文件或添加下方链接。"
            @input="
              emit(
                'update:content',
                ($event.target as HTMLTextAreaElement).value,
              )
            "
          />
        </section>

        <details
          class="checkin-link-details mt-4 rounded-xl border border-slate-200/90 bg-[#fbfcfb]"
        >
          <summary
            class="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-[#2a3832] marker:content-none [&::-webkit-details-marker]:hidden"
          >
            <span class="inline-flex items-center gap-2">
              <span class="checkin-details-chevron text-[#61896f]">▸</span>
              已有网盘 / 图床链接？手动添加
            </span>
          </summary>
          <div class="border-t border-slate-100 px-3 pb-3 pt-1">
            <p class="mb-2 text-xs text-[#61896f]">
              填写可访问的 https 链接；显示名称仅作展示。
            </p>
            <div class="space-y-2">
              <div
                v-for="(row, idx) in manualLinks"
                :key="`link-${idx}`"
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

        <section
          v-if="!isTravelPlan && review && !review.passed"
          class="mt-4 rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-3 sm:px-4"
          data-testid="schedule-checkin-review-panel"
        >
          <p class="text-sm font-bold text-amber-950">未通过核验</p>
          <p class="mt-1 text-xs leading-relaxed text-amber-900/90">
            本次不会保存。请按下方维度补充说明或附件后再点「提交」。
          </p>
          <ul class="mt-2 space-y-2">
            <li
              v-for="dim in review.dimensions"
              :key="dim.id"
              class="rounded-lg bg-white/80 px-2.5 py-2 text-xs leading-relaxed text-[#1a2e24] ring-1 ring-amber-100/80"
            >
              <span class="font-bold text-[#142820]">{{ dim.label }}</span>
              <span class="mx-1.5 text-[#61896f]">·</span>
              <span class="font-semibold text-amber-900/90">{{
                checkinBandLabel(dim.band)
              }}</span>
              <p class="mt-1 text-[#2a3832]/90">{{ dim.hint }}</p>
            </li>
          </ul>
        </section>

        <section
          v-if="!isTravelPlan && review && !review.passed"
          class="mt-3 rounded-xl border border-rose-200/90 bg-rose-50/80 px-3 py-3 sm:px-4"
          data-testid="schedule-checkin-appeal-panel"
        >
          <p class="text-sm font-bold text-rose-900">
            对核验结果有异议？可提交申诉
          </p>
          <p class="mt-1 text-xs text-rose-800/90">
            说明情况与理由（至少 4 字）。提交后先做 AI
            预审：通过则自动完成本槽打卡；未通过则进入人工审核。人工处理前该槽显示「申诉中」；也可先「撤销申诉」再补充材料后重试「提交证明」。
          </p>
          <textarea
            :value="appealText"
            rows="3"
            class="mt-2 w-full rounded-xl border border-rose-200/80 bg-white px-3 py-2 text-sm text-[#111813] placeholder:text-rose-300 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-300/50"
            placeholder="例：已上传的截图在附件中，说明为何应通过核验…"
            @input="
              emit(
                'update:appealText',
                ($event.target as HTMLTextAreaElement).value,
              )
            "
          />
          <div class="mt-2 flex justify-end">
            <button
              type="button"
              class="rounded-lg border border-rose-300/80 bg-white px-4 py-2 text-sm font-bold text-rose-900 shadow-sm hover:bg-rose-50 disabled:opacity-50"
              :disabled="appealSubmitting"
              data-testid="schedule-checkin-appeal-submit"
              @click="emit('submitAppeal')"
            >
              {{ appealSubmitting ? "提交中…" : "提交申诉" }}
            </button>
          </div>
        </section>
      </div>

      <footer
        class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:px-5"
      >
        <button
          type="button"
          class="rounded-lg px-4 py-2 text-sm font-semibold text-[#61896f] hover:bg-slate-50"
          :disabled="saving || appealSubmitting"
          @click="close"
        >
          取消
        </button>
        <button
          type="button"
          class="rounded-lg bg-[#111813] px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#0d1410] disabled:opacity-50"
          :disabled="saving || fileUploading || appealSubmitting"
          data-testid="schedule-checkin-submit"
          @click="emit('submit')"
        >
          {{ saving ? "提交中…" : "提交" }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.checkin-link-details[open] .checkin-details-chevron {
  display: inline-block;
  transform: rotate(90deg);
}
</style>
