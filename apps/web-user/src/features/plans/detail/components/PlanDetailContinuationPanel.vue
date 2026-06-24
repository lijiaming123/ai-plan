<script setup lang="ts">
import { computed, ref, watch, type Ref } from "vue";
import { useRouter } from "vue-router";
import type { PlanRecord } from "../../../../lib/api-client";
import { getApiClient } from "../../../../lib/api-client";
import { authState } from "../../../../stores/auth";

const NEXT_STEP_MAX_LEN = 2000;

const props = defineProps<{
  plan: PlanRecord;
  planId: string;
  loading: boolean;
  isArchived: boolean;
  planFullySubmitted: boolean;
  showError: (message: string) => void;
  okBanner: Ref<string>;
}>();

const router = useRouter();
const continuationHintOpen = ref(false);
const continuationHintDontShowAgain = ref(false);
const continuationHintConsumedForVisit = ref(false);
let continuationHintTimer: number | null = null;
const nextStepDraft = ref("");
const nextStepSaving = ref(false);
const nextStepPanelExpanded = ref(true);

const trimmedNextStepDraft = computed(() => nextStepDraft.value.trim());

const showNextPlanQuickAction = computed(
  () => props.planFullySubmitted && trimmedNextStepDraft.value.length > 0,
);

function extractNextStepFromRequirementMd(md: string): string | null {
  const raw = typeof md === "string" ? md : "";
  if (!raw.trim()) return null;
  const lines = raw.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{2,3}\s*下一步迭代方向\s*$/.test(lines[i]?.trim() ?? "")) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return null;
  const buf: string[] = [];
  for (let j = start; j < lines.length; j++) {
    const line = lines[j] ?? "";
    if (/^#{1,6}\s+/.test(line)) break;
    buf.push(line);
  }
  const inner = buf.join("\n").trim();
  if (!inner) return null;
  return inner.length > NEXT_STEP_MAX_LEN ? inner.slice(0, NEXT_STEP_MAX_LEN) : inner;
}

watch(
  () => [props.plan?.id, props.plan?.nextStep] as const,
  ([id, ns]) => {
    if (!id) return;
    const fromDb = ns != null ? String(ns) : "";
    const inferred =
      extractNextStepFromRequirementMd(props.plan?.requirement ?? "") ?? "";
    const next = fromDb.trim() ? fromDb : inferred;
    nextStepDraft.value = next;
    nextStepPanelExpanded.value = next.trim().length > 0;
  },
  { immediate: true },
);

watch(
  () => props.planId,
  () => {
    continuationHintConsumedForVisit.value = false;
    continuationHintOpen.value = false;
    continuationHintDontShowAgain.value = false;
  },
);

function continuationHintStorageKey(id: string) {
  return `planContinuationHintDismissed:${id}`;
}

watch(
  () => ({
    loading: props.loading,
    pid: props.planId,
    full: props.planFullySubmitted,
    archived: props.isArchived,
    inferred: extractNextStepFromRequirementMd(props.plan?.requirement ?? "") ?? "",
  }),
  (ctx) => {
    if (ctx.loading || !ctx.pid || ctx.archived) return;
    if (!ctx.full) return;
    if (!ctx.inferred.trim()) return;
    if (continuationHintConsumedForVisit.value) return;
    try {
      if (localStorage.getItem(continuationHintStorageKey(ctx.pid)) === "1")
        return;
    } catch {
      /* ignore */
    }
    continuationHintConsumedForVisit.value = true;
    if (continuationHintTimer) {
      window.clearTimeout(continuationHintTimer);
      continuationHintTimer = null;
    }
    continuationHintTimer = window.setTimeout(() => {
      continuationHintOpen.value = true;
      continuationHintTimer = null;
    }, 220);
  },
  { immediate: true },
);

function acknowledgeContinuationHint() {
  continuationHintOpen.value = false;
  if (continuationHintDontShowAgain.value) {
    try {
      localStorage.setItem(continuationHintStorageKey(props.planId), "1");
    } catch {
      /* ignore */
    }
  }
}

async function saveNextStepField() {
  if (!authState.token || !props.plan) return;
  const trimmed = trimmedNextStepDraft.value;
  if (trimmed.length > NEXT_STEP_MAX_LEN) {
    props.showError(
      `下一步内容有点长了（最多 ${NEXT_STEP_MAX_LEN} 字），可以精简一下`,
    );
    return;
  }
  nextStepSaving.value = true;
  try {
    const res = await getApiClient().patchPlan({
      id: props.plan.id,
      token: authState.token,
      nextStep: trimmed,
    });
    props.plan.nextStep = res.nextStep;
    props.okBanner.value = "已保存下一步要做的事";
    window.setTimeout(() => {
      props.okBanner.value = "";
    }, 3500);
  } catch (e) {
    props.showError(e instanceof Error ? e.message : "没保存成功，请稍后再试");
  } finally {
    nextStepSaving.value = false;
  }
}

function goCreateNextPlanFromContinuation() {
  void router.push({
    path: "/plans/new",
    query: { continuationFrom: props.planId },
  });
}

defineExpose({ continuationHintOpen });
</script>

<template>
  <Transition
    enter-active-class="transition duration-250 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition duration-180 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="continuationHintOpen"
      class="fixed inset-0 z-[62] flex items-center justify-center bg-black/45 p-4"
      data-testid="plan-continuation-hint-dialog"
      role="dialog"
      aria-modal="true"
      @click.self="continuationHintOpen = false"
    >
      <Transition
        enter-active-class="transition duration-250 ease-out delay-75"
        enter-from-class="opacity-0 translate-y-1 scale-[0.98]"
        enter-to-class="opacity-100 translate-y-0 scale-100"
        leave-active-class="transition duration-180 ease-in"
        leave-from-class="opacity-100 translate-y-0 scale-100"
        leave-to-class="opacity-0 translate-y-1 scale-[0.98]"
      >
        <div
          v-if="continuationHintOpen"
          class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/80"
          @click.stop
        >
          <h3 class="text-lg font-extrabold text-[#0f1f16]">
            要制定下一步计划吗？
          </h3>
          <p class="mt-2 text-sm leading-relaxed text-[#5a6f62]">
            当前计划各打卡段均已提交。可先检查/补充「下一步迭代方向」，再一键创建接续计划。
          </p>
          <label
            class="mt-4 flex cursor-pointer items-start gap-2 text-sm text-[#37403d]"
          >
            <input
              v-model="continuationHintDontShowAgain"
              type="checkbox"
              class="mt-1"
            />
            <span>本计划不再提示</span>
          </label>
          <div class="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              class="rounded-lg px-4 py-2 text-sm font-semibold text-[#61896f] hover:bg-emerald-50/60"
              data-testid="plan-continuation-hint-close"
              @click="continuationHintOpen = false"
            >
              稍后
            </button>
            <button
              type="button"
              class="rounded-lg bg-[#111813] px-4 py-2 text-sm font-bold text-white hover:bg-[#0d1410]"
              data-testid="plan-continuation-hint-ok"
              @click="acknowledgeContinuationHint()"
            >
              知道了
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>

  <section
    v-if="!isArchived && planFullySubmitted"
    class="mb-6 rounded-2xl border border-[#d4e5dc] bg-white p-5 shadow-[0_12px_36px_-24px_rgba(12,72,48,0.14)] ring-1 ring-[#e8f2ec]"
    data-testid="plan-next-step-continuation-panel"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold text-[#2a3832]">下一步迭代方向</p>
        <p class="mt-1 text-xs text-[#61896f]">
          全部打卡提交完成后，可以在这里写下下一阶段要做的事；保存后不会影响当前计划正文。
        </p>
      </div>
      <button
        v-if="trimmedNextStepDraft.length === 0"
        type="button"
        class="shrink-0 rounded-lg border border-[#dbe6df] bg-white px-3 py-2 text-xs font-semibold text-[#111813] hover:bg-[#f6faf7]"
        data-testid="btn-expand-next-step"
        @click="nextStepPanelExpanded = true"
      >
        写一下下一步要做什么
      </button>
      <button
        v-if="showNextPlanQuickAction"
        type="button"
        class="shrink-0 rounded-lg bg-[#111813] px-4 py-2 text-xs font-bold text-white hover:bg-[#0d1410] disabled:opacity-50"
        data-testid="btn-quick-create-next-plan"
        @click="goCreateNextPlanFromContinuation"
      >
        用它创建下一步计划
      </button>
    </div>
    <div v-if="nextStepPanelExpanded" class="mt-4">
      <textarea
        v-model="nextStepDraft"
        class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm leading-relaxed"
        rows="4"
        :maxlength="NEXT_STEP_MAX_LEN"
        data-testid="plan-next-step-textarea"
        placeholder="简单写下下一阶段要做什么（可选）。保存后会出现「创建下一步计划」入口。"
      />
      <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p class="text-[11px] text-[#8a978f]">
          {{ trimmedNextStepDraft.length }}/{{ NEXT_STEP_MAX_LEN }}
        </p>
        <div class="flex items-center gap-2">
          <button
            v-if="trimmedNextStepDraft.length === 0"
            type="button"
            class="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#61896f] hover:bg-emerald-50/60"
            data-testid="btn-collapse-next-step"
            @click="nextStepPanelExpanded = false"
          >
            收起
          </button>
          <button
            type="button"
            class="rounded-lg border border-[#dbe6df] bg-[#f6faf7] px-3 py-1.5 text-xs font-semibold text-[#111813] hover:bg-[#eef3ef] disabled:opacity-50"
            data-testid="btn-save-next-step"
            :disabled="nextStepSaving"
            @click="saveNextStepField"
          >
            {{ nextStepSaving ? "保存中…" : "保存" }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
