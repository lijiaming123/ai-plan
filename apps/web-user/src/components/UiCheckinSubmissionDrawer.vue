<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ScheduleSlotCheckinRecord } from "../lib/api-client";

const props = defineProps<{
  modelValue: boolean;
  slotKey: string;
  planText?: string;
  submissions: ScheduleSlotCheckinRecord[];
  /** 抽屉标题（默认：提交记录） */
  title?: string;
  /** slotKey 上方的小标题前缀（默认：本段打卡） */
  slotPrefixLabel?: string;
  /** 顶部提示（可选） */
  tipText?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
}>();

function close() {
  emit("update:modelValue", false);
}

const viewMode = ref<"latest" | "all">("latest");

watch(
  () => props.modelValue,
  (open) => {
    if (open) viewMode.value = "latest";
  },
);

const totalCount = computed(() => props.submissions.length);
const latest = computed(() => (props.submissions.length ? props.submissions[0]! : null));
const latestTime = computed(() => (latest.value ? formatTime(latest.value.createdAt) : ""));
const totalAttachments = computed(() =>
  props.submissions.reduce((acc, x) => acc + (x.attachments?.length ?? 0), 0),
);

const visibleSubmissions = computed(() => {
  if (viewMode.value === "latest") return latest.value ? [latest.value] : [];
  return props.submissions;
});

const headerTitle = computed(() => props.title?.trim() || "提交记录");
const slotPrefix = computed(() => props.slotPrefixLabel?.trim() || "本段打卡");

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
}

function openAllAttachments() {
  const urls =
    viewMode.value === "latest"
      ? latest.value?.attachments?.map((a) => a.url) ?? []
      : props.submissions.flatMap((s) => s.attachments?.map((a) => a.url) ?? []);
  const uniq = Array.from(new Set(urls)).slice(0, 12);
  for (const u of uniq) {
    window.open(u, "_blank", "noreferrer");
  }
}
</script>

<template>
  <ElDrawer
    :model-value="modelValue"
    size="480px"
    direction="rtl"
    :with-header="false"
    class="ui-checkin-submission-drawer"
    @close="close"
    @update:modelValue="(v: boolean) => emit('update:modelValue', v)"
  >
    <div class="flex h-full flex-col">
      <header class="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div class="min-w-0">
          <p class="text-xs font-semibold tracking-[0.12em] text-[#61896f]">
            {{ slotPrefix }} {{ slotKey }}
          </p>
          <h3 class="mt-1 text-lg font-extrabold text-[#0f1f16]">
            {{ headerTitle }}
          </h3>
          <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[#7c8a84]">
            <span v-if="totalCount" class="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 ring-1 ring-slate-200/70">
              共 {{ totalCount }} 条
            </span>
            <span v-if="totalAttachments" class="inline-flex items-center rounded-full bg-[#f1f5f3] px-2 py-0.5 ring-1 ring-[#dbe6df]">
              附件 {{ totalAttachments }}
            </span>
            <span v-if="latestTime" class="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[#0b5c34] ring-1 ring-emerald-200/70">
              最新 {{ latestTime }}
            </span>
          </div>
          <p v-if="planText" class="mt-2 line-clamp-3 text-xs leading-relaxed text-[#5a6f62]">
            {{ planText }}
          </p>
          <p
            v-if="tipText?.trim()"
            class="mt-2 rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 py-2.5 text-xs leading-relaxed text-[#4a5c52]"
            data-testid="checkin-submission-drawer-tip"
          >
            {{ tipText }}
          </p>
        </div>
        <button
          type="button"
          class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-700 ring-1 ring-stone-200/80 transition hover:bg-stone-200/70"
          aria-label="关闭"
          data-testid="checkin-submission-drawer-close"
          @click="close"
        >
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
        </button>
      </header>

      <main class="ui-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        <slot name="composer" />
        <div v-if="totalCount" class="flex flex-wrap items-center justify-between gap-2">
          <div class="inline-flex rounded-xl border border-[#dbe6df] bg-white p-1 text-xs font-semibold text-[#111813]">
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 transition"
              :class="viewMode === 'latest' ? 'bg-[#111813] text-white' : 'hover:bg-[#f6f8f6]'"
              data-testid="checkin-submission-view-latest"
              @click="viewMode = 'latest'"
            >
              仅最新
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 transition"
              :class="viewMode === 'all' ? 'bg-[#111813] text-white' : 'hover:bg-[#f6f8f6]'"
              data-testid="checkin-submission-view-all"
              @click="viewMode = 'all'"
            >
              全部
            </button>
          </div>

          <button
            v-if="totalAttachments"
            type="button"
            class="rounded-xl border border-[#dbe6df] bg-white px-3 py-2 text-xs font-bold text-[#111813] transition hover:bg-[#f6f8f6]"
            data-testid="checkin-submission-open-all"
            @click="openAllAttachments"
          >
            打开附件
          </button>
        </div>

        <div
          v-if="totalCount === 0"
          class="rounded-2xl border border-dashed border-slate-200 bg-[#fbfcfb] p-4 text-sm text-[#5a6f62]"
        >
          这里还没有记录。
        </div>

        <section
          v-for="(s, idx) in visibleSubmissions"
          :key="s.id"
          class="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_10px_24px_-20px_rgba(12,72,48,0.2)]"
        >
          <div class="flex items-center justify-between gap-3">
            <p class="text-xs font-semibold text-[#2a3832]">
              {{ idx === 0 ? "最新" : `记录 ${visibleSubmissions.length - idx}` }}
            </p>
            <p class="text-[11px] font-semibold text-[#7c8a84]">
              {{ formatTime(s.createdAt) }}
            </p>
          </div>

          <p
            v-if="s.content?.trim()"
            class="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#111813]"
          >
            {{ s.content }}
          </p>

          <div v-if="s.attachments?.length" class="mt-3 flex flex-col gap-2">
            <p class="text-xs font-bold text-[#2a3832]">附件（{{ s.attachments.length }}）</p>
            <div
              v-for="a in s.attachments"
              :key="a.id"
              class="flex items-center gap-2"
            >
              <a
                class="group flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border border-[#e6ebe8] bg-[#fbfcfb] px-3 py-2 text-xs font-semibold text-[#0b5c34] transition hover:bg-[#f6faf7]"
                :href="a.url"
                target="_blank"
                rel="noreferrer"
              >
                <span class="min-w-0 truncate">
                  {{ a.fileName || a.url }}
                </span>
                <span class="shrink-0 text-[11px] font-bold text-[#61896f] group-hover:text-[#0a8f4a]">
                  打开
                </span>
              </a>
              <button
                type="button"
                class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#dbe6df] bg-white text-[#5d6a64] transition hover:bg-[#f6f8f6]"
                :aria-label="`复制链接：${a.fileName || '附件'}`"
                data-testid="checkin-submission-copy-link"
                @click="copy(a.url)"
              >
                <span class="material-symbols-outlined text-[18px]" aria-hidden="true">content_copy</span>
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  </ElDrawer>
</template>

