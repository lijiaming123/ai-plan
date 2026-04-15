<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import PageSectionHeading from "../../components/PageSectionHeading.vue";
import PlanHeatmapGrid from "../../components/PlanHeatmapGrid.vue";
import UiErrorToast from "../../components/UiErrorToast.vue";
import {
  getApiClient,
  type PlanHeatmapResponse,
  type PlanListRow,
} from "../../lib/api-client";
import { authState } from "../../stores/auth";

const RECENT_PLANS_LIMIT = 6;

const PLAN_TYPE_META: Record<
  string,
  { label: string; bar: string; chip: string }
> = {
  general: {
    label: "综合",
    bar: "border-l-slate-400",
    chip: "bg-slate-100/90 text-slate-700 ring-slate-200/50",
  },
  study: {
    label: "学习",
    bar: "border-l-sky-400",
    chip: "bg-sky-50 text-sky-900 ring-sky-200/50",
  },
  work: {
    label: "工作",
    bar: "border-l-indigo-400",
    chip: "bg-indigo-50 text-indigo-900 ring-indigo-200/50",
  },
  exam: {
    label: "考试",
    bar: "border-l-violet-400",
    chip: "bg-violet-50 text-violet-900 ring-violet-200/50",
  },
  fitness: {
    label: "健身",
    bar: "border-l-orange-400",
    chip: "bg-orange-50 text-orange-900 ring-orange-200/50",
  },
  other: {
    label: "其它",
    bar: "border-l-amber-500",
    chip: "bg-amber-50 text-amber-900 ring-amber-200/50",
  },
};

function planTypeMeta(type: string) {
  const k = String(type ?? "")
    .trim()
    .toLowerCase();
  return (
    PLAN_TYPE_META[k] ?? {
      label: "计划",
      bar: "border-l-emerald-500",
      chip: "bg-emerald-50 text-emerald-900 ring-emerald-200/55",
    }
  );
}

function deadlineDayFromIso(iso: string): string {
  const d = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : iso;
}

function plainDescription(raw: string, max = 120): string {
  const t = raw
    .replace(/<[^>]+>/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= max) return t || "暂无描述";
  return `${t.slice(0, max)}…`;
}

/** 相对「今天」的截止紧迫度（本地日历日） */
function deadlineUrgency(iso: string): { text: string; cls: string } {
  const day = deadlineDayFromIso(iso);
  const end = new Date(`${day}T23:59:59`);
  const start = new Date(`${day}T00:00:00`);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffEnd = Math.ceil((end.getTime() - todayStart.getTime()) / 86400000);
  const diffStart = Math.ceil((start.getTime() - todayStart.getTime()) / 86400000);
  if (diffEnd < 0) {
    const overdue = Math.abs(diffEnd);
    return {
      text: `已逾期 ${overdue} 天`,
      cls: "bg-rose-50/95 text-rose-800 ring-rose-200/60",
    };
  }
  if (diffStart <= 0 && diffEnd >= 0) {
    return {
      text: "今日截止",
      cls: "bg-amber-50/95 text-amber-900 ring-amber-200/55",
    };
  }
  const daysLeft = Math.ceil((start.getTime() - todayStart.getTime()) / 86400000);
  if (daysLeft <= 7) {
    return {
      text: `剩余 ${daysLeft} 天`,
      cls: "bg-emerald-50/95 text-emerald-900 ring-emerald-200/45",
    };
  }
  return {
    text: `剩余 ${daysLeft} 天`,
    cls: "bg-stone-100/90 text-stone-600 ring-stone-200/40",
  };
}

/** 相对「今年」最多向前/向后扩展的年份跨度（避免下拉过长，且与后端合理年份一致） */
const HEATMAP_YEAR_RANGE_PAST = 12;
const HEATMAP_YEAR_RANGE_FUTURE = 25;

const currentCalendarYear = new Date().getFullYear();
const selectedYear = ref(currentCalendarYear);
const heatmapLoading = ref(false);
const heatmapData = ref<PlanHeatmapResponse | null>(null);
const errorToastMessage = ref("");

const recentPlans = ref<PlanListRow[]>([]);
/** 与「最近计划」同一次 listPlans，用于推算年份下拉的上下界 */
const plansForYearBounds = ref<PlanListRow[]>([]);
const recentPlansLoading = ref(false);
const recentPlansError = ref("");

function yearFromDeadlineIso(iso: string, fallback: number): number {
  const d = iso.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const y = parseInt(d.slice(0, 4), 10);
    if (Number.isFinite(y) && y >= 1970 && y <= 2100) return y;
  }
  return fallback;
}

const yearOptions = computed(() => {
  const now = currentCalendarYear;
  let minY = now - 1;
  let maxY = now + 1;
  for (const p of plansForYearBounds.value) {
    const dy = yearFromDeadlineIso(p.deadline, now);
    minY = Math.min(minY, dy);
    maxY = Math.max(maxY, dy);
  }
  minY = Math.max(minY, now - HEATMAP_YEAR_RANGE_PAST);
  maxY = Math.min(maxY, now + HEATMAP_YEAR_RANGE_FUTURE);
  const list: number[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    list.push(y);
  }
  return list;
});

const heatmapStats = computed(() => {
  const data = heatmapData.value?.days;
  if (!data?.length) return null;
  let completed = 0;
  let missed = 0;
  let pending = 0;
  let withDue = 0;
  for (const x of data) {
    if (x.status === "completed") completed += 1;
    else if (x.status === "missed") missed += 1;
    else if (x.status === "pending") pending += 1;
    if (x.status !== "none") withDue += 1;
  }
  return { completed, missed, pending, withDue };
});

async function loadHeatmap() {
  if (!authState.token) {
    heatmapData.value = null;
    return;
  }
  heatmapLoading.value = true;
  errorToastMessage.value = "";
  try {
    heatmapData.value = await getApiClient().getPlanHeatmap({
      token: authState.token,
      year: selectedYear.value,
    });
  } catch (e) {
    heatmapData.value = null;
    errorToastMessage.value =
      e instanceof Error ? e.message : "加载热力图失败";
  } finally {
    heatmapLoading.value = false;
  }
}

async function loadRecentPlans() {
  if (!authState.token) {
    recentPlans.value = [];
    plansForYearBounds.value = [];
    return;
  }
  recentPlansLoading.value = true;
  recentPlansError.value = "";
  try {
    const { plans } = await getApiClient().listPlans({
      token: authState.token,
      sort: "deadline",
    });
    plansForYearBounds.value = plans;
    recentPlans.value = plans.slice(0, RECENT_PLANS_LIMIT);
  } catch (e) {
    recentPlans.value = [];
    plansForYearBounds.value = [];
    recentPlansError.value =
      e instanceof Error ? e.message : "最近计划加载失败";
  } finally {
    recentPlansLoading.value = false;
  }
}

onMounted(() => {
  void loadHeatmap();
  void loadRecentPlans();
});

watch(selectedYear, () => {
  void loadHeatmap();
});

/** 计划列表刷新后，保证当前选中仍在可选范围内 */
watch(
  yearOptions,
  (opts) => {
    if (!opts.length) return;
    if (!opts.includes(selectedYear.value)) {
      selectedYear.value = opts.includes(currentCalendarYear)
        ? currentCalendarYear
        : (opts[opts.length - 1] ?? currentCalendarYear);
    }
  },
  { flush: "post" },
);

const yearSelectFilterable = computed(() => yearOptions.value.length > 12);
</script>

<template>
  <div
    class="dashboard-root relative flex h-full min-h-0 w-full flex-col font-plan text-stone-800"
  >
    <UiErrorToast
      :message="errorToastMessage"
      @close="errorToastMessage = ''"
    />

    <!-- 氛围底：与「我的计划」同系的柔光 + 轻噪点 -->
    <div
      class="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl opacity-[0.92]"
    >
      <div
        class="absolute -left-16 -top-20 h-64 w-64 rounded-full bg-[#b8e9c8]/40 blur-3xl"
        aria-hidden="true"
      />
      <div
        class="absolute -bottom-24 right-[-10%] h-72 w-72 rounded-full bg-[#d4f0e0]/70 blur-3xl"
        aria-hidden="true"
      />
      <div
        class="absolute right-1/4 top-1/3 h-48 w-48 rounded-full bg-[#a7d7f9]/15 blur-3xl"
        aria-hidden="true"
      />
      <div class="dash-home-grain absolute inset-0" aria-hidden="true" />
    </div>

    <header class="relative mb-5 shrink-0 sm:mb-6">
      <PageSectionHeading kicker="工作台" title="概览" />
    </header>

    <div
      class="ui-scrollbar relative min-h-0 flex-1 overflow-y-auto pr-1 pb-2"
    >
    <!-- 热力图 -->
    <section
      class="dash-panel relative mb-6 overflow-hidden rounded-[1.35rem] border border-white/70 bg-white/75 p-5 shadow-[0_18px_48px_-28px_rgba(15,60,40,0.28),0_0_0_1px_rgba(16,185,129,0.06)_inset] backdrop-blur-md sm:mb-7 sm:p-6"
      aria-labelledby="heatmap-heading"
    >
      <div
        class="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-emerald-200/25 to-transparent"
        aria-hidden="true"
      />
      <div class="relative mb-4 flex flex-col gap-3">
        <div
          class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        >
          <div class="flex min-w-0 items-center gap-3">
            <span
              class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-50 to-white text-emerald-700 shadow-[0_4px_14px_-6px_rgba(5,80,40,0.35)] ring-1 ring-emerald-100/80"
              aria-hidden="true"
            >
              <span class="material-symbols-outlined text-[22px]"
                >calendar_month</span
              >
            </span>
            <h2
              id="heatmap-heading"
              class="text-lg font-bold tracking-tight text-[#0f2918] sm:text-[1.15rem]"
            >
              计划打卡热力图
            </h2>
          </div>
          <div
            class="w-full shrink-0 sm:w-auto"
            data-testid="heatmap-year-field"
          >
            <div
              class="w-full min-w-[7.75rem] rounded-2xl border border-emerald-200/50 bg-white/90 p-1 shadow-[0_1px_0_rgba(255,255,255,0.92)_inset,0_8px_22px_-14px_rgba(12,80,48,0.18)] ring-1 ring-white/90 sm:ml-auto sm:w-auto"
            >
              <ElSelect
                v-model="selectedYear"
                :filterable="yearSelectFilterable"
                class="ui-sunrise-el-select ui-sunrise-el-select--heatmap-year"
                popper-class="ui-sunrise-select-dropdown"
                data-testid="heatmap-year-select"
                aria-label="选择年份"
              >
                <ElOption
                  v-for="y in yearOptions"
                  :key="y"
                  :value="y"
                  :label="`${y} 年`"
                />
              </ElSelect>
            </div>
          </div>
        </div>
        <div
          v-if="heatmapStats && !heatmapLoading"
          class="flex flex-wrap items-center gap-2"
        >
          <template v-if="heatmapStats.withDue === 0">
            <span
              class="inline-flex items-center gap-1.5 rounded-full border border-stone-200/70 bg-stone-50/90 px-3 py-1.5 text-[12px] font-medium leading-snug text-[#5c6d62] ring-1 ring-white/80"
            >
              <span
                class="material-symbols-outlined text-[18px] text-stone-400"
                aria-hidden="true"
                >event_busy</span
              >
              该年暂无应打卡日；有排期后格子会显示完成情况。
            </span>
          </template>
          <template v-else>
            <span
              class="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold text-stone-600 ring-1 ring-stone-200/60"
            >
              <span
                class="h-1.5 w-1.5 rounded-full bg-emerald-500"
                aria-hidden="true"
              />
              有打卡要求 {{ heatmapStats.withDue }} 天
            </span>
            <span
              class="inline-flex items-center gap-1.5 rounded-full bg-emerald-50/90 px-3 py-1 text-[11px] font-semibold text-emerald-900 ring-1 ring-emerald-200/50"
            >
              已满足 {{ heatmapStats.completed }} 天
            </span>
            <span
              v-if="heatmapStats.pending > 0"
              class="inline-flex items-center gap-1.5 rounded-full bg-amber-50/90 px-3 py-1 text-[11px] font-semibold text-amber-950 ring-1 ring-amber-200/55"
            >
              待打卡 {{ heatmapStats.pending }} 天
            </span>
            <span
              v-if="heatmapStats.missed > 0"
              class="inline-flex items-center gap-1.5 rounded-full bg-rose-50/90 px-3 py-1 text-[11px] font-semibold text-rose-800 ring-1 ring-rose-200/50"
            >
              有遗漏 {{ heatmapStats.missed }} 天
            </span>
          </template>
        </div>
      </div>

      <div
        v-if="heatmapLoading"
        class="flex min-h-[160px] flex-col items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-b from-stone-50/90 to-white/50 text-stone-500 ring-1 ring-stone-100/80"
        aria-busy="true"
        aria-live="polite"
      >
        <span
          class="inline-block h-9 w-9 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600"
          aria-hidden="true"
        />
        <span class="text-sm font-medium tracking-tight">载入热力图…</span>
      </div>
      <div
        v-else-if="heatmapData"
        class="rounded-2xl bg-gradient-to-b from-stone-50/80 via-white/50 to-emerald-50/15 p-3 ring-1 ring-stone-100/80 sm:p-4"
      >
        <PlanHeatmapGrid
          :year="heatmapData.year"
          :days="heatmapData.days"
        />
      </div>
    </section>

    <!-- 最近计划 -->
    <section
      class="dash-panel relative overflow-hidden rounded-[1.35rem] border border-white/70 bg-white/75 p-5 shadow-[0_18px_48px_-28px_rgba(15,60,40,0.22),0_0_0_1px_rgba(16,185,129,0.05)_inset] backdrop-blur-md sm:p-6"
      aria-labelledby="recent-plans-heading"
    >
      <div
        class="relative mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex min-w-0 items-center gap-3">
          <span
            class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-stone-50 to-white text-stone-600 shadow-[0_4px_14px_-6px_rgba(30,40,35,0.2)] ring-1 ring-stone-200/70"
            aria-hidden="true"
          >
            <span class="material-symbols-outlined text-[22px]">schedule</span>
          </span>
          <div class="min-w-0">
            <h2
              id="recent-plans-heading"
              class="text-lg font-bold tracking-tight text-[#0f2918] sm:text-[1.15rem]"
            >
              最近计划
            </h2>
            <p class="mt-0.5 text-[12px] leading-snug text-[#6e7b75]">
              按截止日 · 最多 {{ RECENT_PLANS_LIMIT }} 条
            </p>
          </div>
        </div>
        <router-link
          to="/plans"
          class="group inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1 self-start rounded-full bg-emerald-50/90 px-4 py-2.5 text-[13px] font-bold text-emerald-800 ring-1 ring-emerald-200/60 transition hover:bg-emerald-100/90 hover:ring-emerald-300/60 active:scale-[0.99] sm:self-auto"
          data-testid="recent-plans-view-all"
        >
          查看全部
          <span
            class="material-symbols-outlined text-[18px] transition group-hover:translate-x-0.5"
            >chevron_right</span
          >
        </router-link>
      </div>

      <div
        v-if="recentPlansLoading"
        class="flex min-h-[100px] flex-col items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-b from-stone-50/90 to-white/50 text-stone-500 ring-1 ring-stone-100/80"
        aria-busy="true"
        aria-live="polite"
      >
        <span
          class="inline-block h-8 w-8 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600"
          aria-hidden="true"
        />
        <span class="text-sm font-medium">加载中…</span>
      </div>
      <p
        v-else-if="recentPlansError"
        class="rounded-2xl border border-rose-100 bg-rose-50/80 px-4 py-3 text-sm font-medium text-rose-800"
        role="alert"
      >
        {{ recentPlansError }}
      </p>
      <ul
        v-else-if="recentPlans.length"
        class="space-y-2.5 sm:space-y-3"
        data-testid="recent-plans-list"
      >
        <li
          v-for="(p, rowIndex) in recentPlans"
          :key="p.id"
          class="dash-plan-row"
          :style="{ '--i': rowIndex }"
        >
          <router-link
            :to="`/plans/${p.id}`"
            class="group relative flex min-h-[3.25rem] items-stretch gap-0 overflow-hidden rounded-2xl border border-stone-200/70 bg-white/85 outline-none ring-white/60 transition duration-300 hover:-translate-y-0.5 hover:border-emerald-200/55 hover:bg-white hover:shadow-[0_16px_40px_-24px_rgba(12,100,60,0.25)] focus-visible:ring-2 focus-visible:ring-emerald-400/40 active:scale-[0.998]"
            :data-testid="`recent-plan-row-${p.id}`"
          >
            <div
              class="w-1 shrink-0 rounded-l-2xl border-l-[3px] bg-transparent"
              :class="planTypeMeta(p.type).bar"
              aria-hidden="true"
            />
            <div
              class="flex min-w-0 flex-1 flex-col gap-1.5 px-3.5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4 sm:py-3.5"
            >
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <p
                    class="truncate text-[15px] font-bold tracking-tight text-[#0f2918] group-hover:text-emerald-900"
                  >
                    {{ p.goal }}
                  </p>
                  <span
                    class="inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1"
                    :class="planTypeMeta(p.type).chip"
                  >
                    {{ planTypeMeta(p.type).label }}
                  </span>
                </div>
                <p
                  class="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-stone-500 sm:line-clamp-1 sm:text-[13px]"
                >
                  {{ plainDescription(p.requirement) }}
                </p>
              </div>
              <div
                class="flex shrink-0 flex-col items-start gap-1.5 sm:items-end sm:gap-1.5 sm:text-right"
              >
                <span
                  class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ring-1"
                  :class="deadlineUrgency(p.deadline).cls"
                >
                  {{ deadlineUrgency(p.deadline).text }}
                </span>
                <span
                  class="text-[12px] font-medium tabular-nums text-stone-500"
                >
                  截止 {{ deadlineDayFromIso(p.deadline) }}
                </span>
              </div>
            </div>
            <div
              class="flex shrink-0 items-center pr-3 text-stone-300 transition group-hover:text-emerald-600"
              aria-hidden="true"
            >
              <span class="material-symbols-outlined text-[22px]"
                >arrow_forward_ios</span
              >
            </div>
          </router-link>
        </li>
      </ul>
      <div
        v-else
        class="rounded-2xl border border-dashed border-stone-200/90 bg-stone-50/60 px-5 py-9 text-center"
      >
        <p class="mx-auto max-w-sm text-sm leading-relaxed text-stone-600">
          暂无已定稿计划，创建后将按截止日出现在这里。
        </p>
        <router-link
          to="/plans/new"
          class="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#0a8f4a] px-6 text-sm font-bold text-white shadow-md shadow-emerald-900/15 transition hover:brightness-105 active:scale-[0.99]"
        >
          创建计划
        </router-link>
      </div>
    </section>
    </div>
  </div>
</template>

<style scoped>
.dash-home-grain {
  opacity: 0.035;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

@media (prefers-reduced-motion: no-preference) {
  .dash-plan-row {
    animation: dash-row-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards;
    animation-delay: calc(var(--i, 0) * 60ms);
  }
}

@keyframes dash-row-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dash-plan-row {
    animation: none;
  }
}
</style>
