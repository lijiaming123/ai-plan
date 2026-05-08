<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageSectionHeading from "../../components/PageSectionHeading.vue";
import UiErrorToast from "../../components/UiErrorToast.vue";
import UiConfirmDialog from "../../components/UiConfirmDialog.vue";
import { getApiClient, type PlanListRow } from "../../lib/api-client";
import { buildPlanCardDisplayTexts } from "../../lib/plan-list-card-text";
import { useCloseOnEscape } from "../../composables/useCloseOnEscape";
import { authState } from "../../stores/auth";
import { planListSearchQuery } from "../../stores/plan-search-query";

type PlanStatus = "执行中" | "已完成" | "未开始";
type FilterType = "全部" | "执行中" | "已完成" | "未开始";
type StatusQuery = "in_progress" | "completed" | "not_started";

type PlanCard = {
  id: string;
  title: string;
  description: string;
  /** 封面区一行摘要（已去 Markdown / 脚手架） */
  coverLine: string;
  deadline: string;
  progress: number;
  status: PlanStatus;
  type: string;
  /** 封面改为无图视觉锚点；保留字段便于后续迁移真实数据 */
  image: string;
};

const plans = ref<PlanCard[]>([]);
const listLoading = ref(true);
const errorToastMessage = ref("");
const recentlyDeleted = ref<{ id: string; title: string } | null>(null);
const recentlyArchived = ref<{ id: string; title: string } | null>(null);
const trashCount = ref<number | null>(null);

const desktopMenuPlanId = ref<string | null>(null);
const actionSheetOpen = ref(false);
const actionSheetPlan = ref<Pick<PlanCard, "id" | "title"> | null>(null);

const confirmDeleteOpen = ref(false);
const confirmDeletePlan = ref<Pick<PlanCard, "id" | "title"> | null>(null);
const confirmDeleteSubmitting = ref(false);

const confirmArchiveOpen = ref(false);
const confirmArchivePlan = ref<Pick<PlanCard, "id" | "title"> | null>(null);
const confirmArchiveSubmitting = ref(false);

function closeDesktopMenu() {
  desktopMenuPlanId.value = null;
}

function closeActionSheet() {
  actionSheetOpen.value = false;
  actionSheetPlan.value = null;
}

useCloseOnEscape(actionSheetOpen, closeActionSheet);
useCloseOnEscape(confirmDeleteOpen, () => {
  if (confirmDeleteSubmitting.value) return;
  confirmDeleteOpen.value = false;
  confirmDeletePlan.value = null;
});
useCloseOnEscape(confirmArchiveOpen, () => {
  if (confirmArchiveSubmitting.value) return;
  confirmArchiveOpen.value = false;
  confirmArchivePlan.value = null;
});

/**
 * 标题色：避免与整页浅绿背景「融在一起」——少用青绿系，多用中性灰蓝、天蓝、靛紫与暖色做区分。
 */
const TITLE_COLOR_CLASSES = [
  "text-slate-800",
  "text-sky-700",
  "text-indigo-700",
  "text-violet-700",
  "text-blue-700",
  "text-orange-700",
  "text-rose-700",
  "text-amber-800",
] as const;

const TYPE_TO_TITLE_COLOR: Record<
  string,
  (typeof TITLE_COLOR_CLASSES)[number]
> = {
  general: "text-slate-800",
  study: "text-sky-700",
  work: "text-indigo-700",
  exam: "text-violet-700",
  fitness: "text-orange-700",
  other: "text-amber-800",
};

function hashToIndex(input: string, mod: number) {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return Math.abs(h) % mod;
}

function titleColorClass(plan: Pick<PlanCard, "id" | "type">) {
  const key = String(plan.type ?? "")
    .trim()
    .toLowerCase();
  const byType = TYPE_TO_TITLE_COLOR[key];
  if (byType) return byType;
  return TITLE_COLOR_CLASSES[hashToIndex(plan.id, TITLE_COLOR_CLASSES.length)];
}

function deadlineDayFromIso(iso: string): string {
  const d = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : iso;
}

function utcDayMsFromIso(iso: string): number | null {
  const day = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [y, m, d] = day.split("-").map((x) => Number(x));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return Date.UTC(y, m - 1, d);
}

function computeTimeProgressPercent(params: { startIso: string; endIso: string; now?: Date }): number {
  const startMs = utcDayMsFromIso(params.startIso);
  const endMs = utcDayMsFromIso(params.endIso);
  if (startMs == null || endMs == null) return 0;
  const now = params.now ?? new Date();
  const nowMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const totalDays = Math.floor((endMs - startMs) / 86400000) + 1;
  if (!Number.isFinite(totalDays) || totalDays <= 1) return 100;
  const elapsedDays = Math.floor((nowMs - startMs) / 86400000);
  const ratio = elapsedDays / (totalDays - 1);
  const pct = Math.round(ratio * 100);
  return Math.max(0, Math.min(100, pct));
}

/** 列表仅展示已定稿计划；进度采用“时间推进”估算（后续可替换为按槽完成度）。 */
function rowToCard(row: PlanListRow): PlanCard {
  const deadline = deadlineDayFromIso(row.deadline);
  const { description, coverLine } = buildPlanCardDisplayTexts({
    requirement: row.requirement ?? "",
    type: row.type,
    goal: row.goal ?? "",
  });
  return {
    id: row.id,
    title: row.goal,
    description,
    coverLine,
    deadline,
    image: "",
    progress: computeTimeProgressPercent({
      startIso: row.createdAt ?? row.deadline,
      endIso: row.deadline,
    }),
    status: "执行中",
    type: row.type,
  };
}

async function loadPlans() {
  if (!authState.token) {
    plans.value = [];
    listLoading.value = false;
    return;
  }
  listLoading.value = true;
  errorToastMessage.value = "";
  try {
    const { plans: rows } = await getApiClient().listPlans({
      token: authState.token,
    });
    plans.value = rows.map(rowToCard);
  } catch (e) {
    errorToastMessage.value =
      e instanceof Error ? e.message : "加载计划列表失败";
    plans.value = [];
  } finally {
    listLoading.value = false;
  }
}

onMounted(() => {
  void loadPlans();
  void (async () => {
    if (!authState.token) {
      trashCount.value = null;
      return;
    }
    try {
      const { plans } = await getApiClient().listDeletedPlans({
        token: authState.token,
      });
      trashCount.value = plans.length;
    } catch {
      // 回收站入口不应因计数失败而影响主流程
      trashCount.value = null;
    }
  })();
});

function openActionSheet(plan: Pick<PlanCard, "id" | "title">) {
  actionSheetPlan.value = plan;
  actionSheetOpen.value = true;
}

function openConfirmDelete(plan: Pick<PlanCard, "id" | "title">) {
  closeActionSheet();
  closeDesktopMenu();
  confirmDeletePlan.value = plan;
  confirmDeleteOpen.value = true;
}

function openConfirmArchive(plan: Pick<PlanCard, "id" | "title">) {
  closeActionSheet();
  closeDesktopMenu();
  confirmArchivePlan.value = plan;
  confirmArchiveOpen.value = true;
}

async function submitDeletePlan() {
  const plan = confirmDeletePlan.value;
  if (!plan) return;
  if (!authState.token) {
    errorToastMessage.value = "请先登录后再删除计划。";
    return;
  }
  try {
    confirmDeleteSubmitting.value = true;
    await getApiClient().deletePlan({ id: plan.id, token: authState.token });
    plans.value = plans.value.filter((p) => p.id !== plan.id);
    recentlyDeleted.value = { id: plan.id, title: plan.title };
    trashCount.value = (trashCount.value ?? 0) + 1;
    confirmDeleteOpen.value = false;
    confirmDeletePlan.value = null;
  } catch (e) {
    errorToastMessage.value =
      e instanceof Error ? e.message : "删除计划失败";
  } finally {
    confirmDeleteSubmitting.value = false;
  }
}

async function submitArchivePlan() {
  const plan = confirmArchivePlan.value;
  if (!plan) return;
  if (!authState.token) {
    errorToastMessage.value = "请先登录后再归档计划。";
    return;
  }
  try {
    confirmArchiveSubmitting.value = true;
    await getApiClient().archivePlan({ id: plan.id, token: authState.token });
    plans.value = plans.value.filter((p) => p.id !== plan.id);
    recentlyArchived.value = { id: plan.id, title: plan.title };
    confirmArchiveOpen.value = false;
    confirmArchivePlan.value = null;
  } catch (e) {
    errorToastMessage.value =
      e instanceof Error ? e.message : "归档失败";
  } finally {
    confirmArchiveSubmitting.value = false;
  }
}

async function onUndoDelete() {
  const deleted = recentlyDeleted.value;
  if (!deleted) return;
  if (!authState.token) {
    errorToastMessage.value = "请先登录后再撤销删除。";
    return;
  }
  try {
    await getApiClient().restorePlan({ id: deleted.id, token: authState.token });
    recentlyDeleted.value = null;
    trashCount.value =
      trashCount.value == null ? null : Math.max(0, trashCount.value - 1);
    await loadPlans();
  } catch (e) {
    errorToastMessage.value =
      e instanceof Error ? e.message : "撤销删除失败";
  }
}

async function onUndoArchive() {
  const archived = recentlyArchived.value;
  if (!archived) return;
  if (!authState.token) {
    errorToastMessage.value = "请先登录后再撤销归档。";
    return;
  }
  try {
    await getApiClient().unarchivePlan({
      id: archived.id,
      token: authState.token,
    });
    recentlyArchived.value = null;
    await loadPlans();
  } catch (e) {
    errorToastMessage.value =
      e instanceof Error ? e.message : "撤销归档失败";
  }
}

const filters: FilterType[] = ["全部", "执行中", "已完成", "未开始"];
const route = useRoute();
const router = useRouter();

function filterToQuery(filter: FilterType): StatusQuery | null {
  if (filter === "执行中") return "in_progress";
  if (filter === "已完成") return "completed";
  if (filter === "未开始") return "not_started";
  return null;
}

function queryToFilter(status: string): FilterType | null {
  if (status === "in_progress" || status === "执行中" || status === "进行中")
    return "执行中";
  if (status === "completed") return "已完成";
  if (status === "not_started") return "未开始";
  if (filters.includes(status as FilterType)) return status as FilterType;
  return null;
}

function normalizeFilter(value: unknown): FilterType {
  if (typeof value === "string") return queryToFilter(value) ?? "全部";
  return "全部";
}

const activeFilter = ref<FilterType>(normalizeFilter(route.query.status));

const searchText = computed(() =>
  planListSearchQuery.value.trim().toLowerCase(),
);

const filteredPlans = computed(() => {
  let list = plans.value;
  if (activeFilter.value === "未开始") {
    list = list.filter((p) => p.status === "未开始");
  } else if (activeFilter.value !== "全部") {
    list = list.filter((plan) => plan.status === activeFilter.value);
  }
  const q = searchText.value;
  if (q) {
    list = list.filter(
      (plan) =>
        plan.title.toLowerCase().includes(q) ||
        plan.description.toLowerCase().includes(q) ||
        plan.coverLine.toLowerCase().includes(q),
    );
  }
  return list;
});

const totalPlanCount = computed(() => plans.value.length);

const filterSummary = computed(() => {
  const n = filteredPlans.value.length;
  if (searchText.value) {
    return `找到 ${n} 个与搜索相关的计划`;
  }
  if (activeFilter.value === "全部") {
    return `共 ${totalPlanCount.value} 个计划，慢慢来，每一步都算数`;
  }
  return `当前筛选下共 ${n} 个计划`;
});

function setFilter(filter: FilterType) {
  activeFilter.value = filter;

  const nextQuery = { ...route.query };
  const q = filterToQuery(filter);
  if (!q) delete nextQuery.status;
  else nextQuery.status = q;
  router.replace({ query: nextQuery });
}

function statusClass(status: PlanStatus) {
  if (status === "执行中") {
    return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80";
  }
  if (status === "已完成") {
    return "bg-teal-50 text-teal-900 ring-1 ring-teal-200/70";
  }
  return "bg-stone-100 text-stone-600 ring-1 ring-stone-200/80";
}

function coverTheme(status: PlanStatus) {
  if (status === "执行中") return "cover--active";
  if (status === "已完成") return "cover--done";
  return "cover--idle";
}

function fmtDeadline(deadline: string): string {
  // 输入多为 YYYY-MM-DD
  const m = deadline.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return deadline;
  return `${m[2]}-${m[3]}`;
}

function daysDiffFromToday(deadline: string): number | null {
  const d = new Date(`${deadline}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const ms = target.getTime() - today.getTime();
  return Math.round(ms / 86400000);
}

function dueText(deadline: string): string {
  return `截止 ${fmtDeadline(deadline)}`;
}

function relativeText(deadline: string): string {
  const dd = daysDiffFromToday(deadline);
  if (dd === null) return "";
  if (dd > 0) return `还剩 ${dd} 天`;
  if (dd < 0) return `已逾期 ${Math.abs(dd)} 天`;
  return "今天截止";
}

watch(
  () => route.query.status,
  (status) => {
    activeFilter.value = normalizeFilter(status);

    // 若 URL 仍是中文状态值，自动迁移到英文枚举，便于分享/更短更稳
    if (typeof status === "string") {
      const desiredFilter = normalizeFilter(status);
      const desired = filterToQuery(desiredFilter);
      const current = status;
      const shouldDelete = desired === null;
      const shouldReplace = !shouldDelete && current !== desired;
      if (shouldReplace) {
        const nextQuery = { ...route.query };
        nextQuery.status = desired;
        router.replace({ query: nextQuery });
      }
    }
  },
  { immediate: true },
);

/** Tab 滑动高亮：仅动轨道上的指示 pill，下方内容区不参与过渡 */
const filterRailRef = ref<HTMLElement | null>(null);
const filterIndicatorStyle = ref<Record<string, string>>({
  left: "0px",
  top: "0px",
  width: "0px",
  height: "0px",
  opacity: "0",
});

function updateFilterIndicator() {
  const rail = filterRailRef.value;
  if (!rail) return;
  const idx = filters.indexOf(activeFilter.value);
  const btn = rail.querySelector(
    `[data-plan-tab-index="${idx}"]`,
  ) as HTMLElement | null;
  if (!btn) return;
  const rl = rail.getBoundingClientRect();
  const br = btn.getBoundingClientRect();
  filterIndicatorStyle.value = {
    left: `${br.left - rl.left}px`,
    top: `${br.top - rl.top}px`,
    width: `${br.width}px`,
    height: `${br.height}px`,
    opacity: "1",
  };
}

function scheduleFilterIndicatorUpdate() {
  void nextTick(() => {
    requestAnimationFrame(() => updateFilterIndicator());
  });
}

let filterResizeObserver: ResizeObserver | null = null;

onMounted(() => {
  window.addEventListener("resize", scheduleFilterIndicatorUpdate);
});

onUnmounted(() => {
  window.removeEventListener("resize", scheduleFilterIndicatorUpdate);
  filterResizeObserver?.disconnect();
  filterResizeObserver = null;
});

watch(activeFilter, scheduleFilterIndicatorUpdate);

watch(
  filterRailRef,
  (el) => {
    filterResizeObserver?.disconnect();
    filterResizeObserver = null;
    if (el && typeof ResizeObserver !== "undefined") {
      filterResizeObserver = new ResizeObserver(scheduleFilterIndicatorUpdate);
      filterResizeObserver.observe(el);
    }
    scheduleFilterIndicatorUpdate();
  },
  { immediate: true },
);
</script>

<template>
  <div
    class="plan-home relative flex h-full min-h-0 w-full flex-col font-plan text-stone-800"
    data-testid="plan-overview-root"
    @click="closeDesktopMenu"
  >
    <!-- 柔和氛围底：渐变 + 轻噪点 -->
    <div
      class="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl opacity-90"
    >
      <div
        class="absolute -left-20 -top-24 h-72 w-72 rounded-full bg-[#c8f5d4]/35 blur-3xl"
        aria-hidden="true"
      />
      <div
        class="absolute -bottom-16 right-0 h-80 w-80 rounded-full bg-[#e8f7ed]/80 blur-3xl"
        aria-hidden="true"
      />
      <div class="plan-home-grain absolute inset-0" aria-hidden="true" />
    </div>

    <header class="relative mb-6 shrink-0 sm:mb-8">
      <PageSectionHeading kicker="计划与执行" title="我的计划">
        <p>{{ filterSummary }}</p>
      </PageSectionHeading>

      <div class="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div
          class="plan-filter-rail-scroll -mx-1 max-w-full overflow-x-auto overflow-y-visible px-1 pb-0.5 sm:mx-0 sm:overflow-visible sm:px-0"
        >
          <div
            ref="filterRailRef"
            class="plan-filter-rail relative inline-flex min-w-min flex-nowrap gap-1 rounded-2xl border border-white/60 bg-white/50 p-1.5 shadow-[0_1px_0_rgba(255,255,255,0.85)_inset,0_8px_24px_-12px_rgba(15,60,40,0.12)] backdrop-blur-sm"
            role="tablist"
            aria-label="计划筛选"
          >
          <span
            class="plan-filter-indicator pointer-events-none absolute z-0 overflow-hidden rounded-xl bg-white shadow-[0_3px_14px_-4px_rgba(12,72,48,0.22),0_0_0_1px_rgba(16,185,129,0.2)] ring-1 ring-emerald-200/55"
            aria-hidden="true"
            :style="filterIndicatorStyle"
          >
            <span
              :key="activeFilter"
              class="plan-filter-indicator-shine"
              aria-hidden="true"
            />
          </span>
          <button
            v-for="(filter, tabIndex) in filters"
            :key="filter"
            type="button"
            :data-testid="`filter-${filter}`"
            :data-plan-tab-index="tabIndex"
            class="relative z-[1] whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-semibold transition-[color,background-color] duration-200 ease-out"
            :class="
              activeFilter === filter
                ? 'text-stone-900'
                : 'text-stone-600 hover:bg-white/55 hover:text-stone-900'
            "
            :aria-selected="activeFilter === filter"
            role="tab"
            @click="setFilter(filter)"
          >
            {{ filter }}
          </button>
          </div>
        </div>
        <router-link
          to="/plans/trash"
          class="inline-flex items-center gap-2 rounded-2xl bg-white/40 px-2.5 py-2 text-sm font-semibold text-stone-600 ring-1 ring-white/60 backdrop-blur-sm transition hover:bg-white/65 hover:text-stone-900"
          data-testid="link-plan-trash"
          @click.stop
        >
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true"
            >restore_from_trash</span
          >
          <span>最近删除</span>
          <span
            v-if="trashCount != null && trashCount > 0"
            class="rounded-full bg-stone-900/8 px-2 py-0.5 text-xs font-extrabold tabular-nums text-stone-700 ring-1 ring-white/70"
            data-testid="trash-count"
          >
            {{ trashCount }}
          </span>
        </router-link>
      </div>
    </header>

    <UiErrorToast
      :message="errorToastMessage"
      @close="errorToastMessage = ''"
    />

    <div
      v-if="recentlyDeleted"
      class="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-emerald-200/70 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-950 shadow-[0_10px_26px_-22px_rgba(16,185,129,0.55)]"
      data-testid="recently-deleted-banner"
    >
      <span class="min-w-0 truncate">
        已删除：<span class="font-semibold">{{ recentlyDeleted.title }}</span>
      </span>
      <div class="flex shrink-0 items-center gap-2">
        <router-link
          to="/plans/trash"
          class="rounded-xl bg-white/50 px-3 py-1.5 text-sm font-semibold text-emerald-900 ring-1 ring-emerald-200/60 transition hover:bg-white/70"
          data-testid="go-trash"
        >
          去最近删除
        </router-link>
        <button
          type="button"
          class="rounded-xl bg-white/70 px-3 py-1.5 text-sm font-semibold text-emerald-900 ring-1 ring-emerald-200/70 transition hover:bg-white"
          data-testid="undo-delete"
          @click.stop.prevent="onUndoDelete"
        >
          撤销
        </button>
      </div>
    </div>

    <div
      v-if="recentlyArchived"
      class="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/85 px-4 py-3 text-sm text-slate-900 shadow-[0_10px_26px_-24px_rgba(15,23,42,0.18)]"
      data-testid="recently-archived-banner"
    >
      <span class="min-w-0 truncate">
        已归档：<span class="font-semibold">{{ recentlyArchived.title }}</span>
      </span>
      <div class="flex shrink-0 items-center gap-2">
        <router-link
          to="/archive"
          class="rounded-xl bg-white/70 px-3 py-1.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-200/70 transition hover:bg-white"
          data-testid="go-archive"
        >
          去归档
        </router-link>
        <button
          type="button"
          class="rounded-xl bg-white/80 px-3 py-1.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-200/75 transition hover:bg-white"
          data-testid="undo-archive"
          @click.stop.prevent="onUndoArchive"
        >
          撤销
        </button>
      </div>
    </div>

    <div class="ui-scrollbar relative min-h-0 flex-1 overflow-y-auto pr-1 pb-2">
      <div
        v-if="listLoading"
        class="flex min-h-[240px] flex-col items-center justify-center gap-2 text-stone-500"
      >
        <span
          class="inline-block h-8 w-8 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600"
          aria-hidden="true"
        />
        <span class="text-sm font-medium">加载计划列表中…</span>
      </div>
      <div
        v-else
        class="grid grid-cols-1 gap-5 pb-8 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3"
      >
        <router-link
          v-for="(plan, index) in filteredPlans"
          :key="plan.id"
          :to="`/plans/${plan.id}`"
          data-testid="plan-card"
          class="animate-plan-card group flex flex-col overflow-hidden rounded-3xl border border-stone-200/80 bg-white/85 shadow-[0_14px_44px_-26px_rgba(10,60,38,0.22)] ring-1 ring-white/85 transition duration-300 hover:-translate-y-1 hover:border-emerald-200/60 hover:bg-white/92 hover:shadow-[0_22px_54px_-24px_rgba(16,100,60,0.2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
          :style="{ '--stagger': `${index * 45}ms` }"
        >
          <!-- 无图封面：进度环 + 时间(A2) + 状态 pill（不展示标签） -->
          <div
            class="plan-cover relative overflow-hidden"
            :class="coverTheme(plan.status)"
          >
            <div class="plan-cover-grain" aria-hidden="true" />
            <div class="plan-cover-soft" aria-hidden="true" />

            <div class="absolute right-3 top-3 z-[2]">
              <button
                type="button"
                class="hidden h-9 w-9 items-center justify-center rounded-xl bg-white/55 text-stone-700 ring-1 ring-white/70 backdrop-blur-sm transition hover:bg-white/75 hover:text-stone-900 sm:inline-flex"
                :data-testid="`plan-more-${plan.id}`"
                aria-label="更多操作"
                @click.stop.prevent="desktopMenuPlanId = desktopMenuPlanId === plan.id ? null : plan.id"
              >
                <span class="text-lg leading-none">⋯</span>
              </button>
              <button
                type="button"
                class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/55 text-stone-700 ring-1 ring-white/70 backdrop-blur-sm transition hover:bg-white/75 hover:text-stone-900 sm:hidden"
                :data-testid="`plan-more-mobile-${plan.id}`"
                aria-label="更多操作"
                @click.stop.prevent="openActionSheet(plan)"
              >
                <span class="text-lg leading-none">⋯</span>
              </button>

              <!-- Desktop popover menu -->
              <div
                v-if="desktopMenuPlanId === plan.id"
                class="absolute right-0 mt-2 w-44 overflow-hidden rounded-2xl border border-stone-200/80 bg-white/95 shadow-[0_18px_48px_-30px_rgba(10,60,38,0.35)] ring-1 ring-white/80 backdrop-blur"
                :data-testid="`plan-menu-${plan.id}`"
                @click.stop
              >
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-extrabold text-slate-700 transition hover:bg-slate-50"
                  :data-testid="`plan-archive-${plan.id}`"
                  @click.stop.prevent="openConfirmArchive(plan)"
                >
                  <span>归档计划</span>
                  <span class="text-xs font-semibold text-slate-500/80"
                    >只读</span
                  >
                </button>
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-extrabold text-rose-700 transition hover:bg-rose-50"
                  :data-testid="`plan-delete-${plan.id}`"
                  @click.stop.prevent="openConfirmDelete(plan)"
                >
                  <span>删除计划</span>
                  <span class="text-xs font-semibold text-rose-700/60"
                    >可恢复</span
                  >
                </button>
              </div>
            </div>

            <div class="plan-cover-inner flex items-center gap-4 px-5 py-4">
              <div
                class="plan-ring-wrap shrink-0"
                :style="{
                  '--p': `${Math.max(0, Math.min(100, plan.progress))}`,
                }"
              >
                <div class="plan-ring" aria-hidden="true" />
                <div class="plan-ring-text" aria-hidden="true">
                  <span class="plan-ring-num tabular-nums"
                    >{{ plan.progress }}%</span
                  >
                </div>
              </div>

              <div class="min-w-0 flex-1">
                <p
                  class="plan-cover-time text-[12px] font-semibold text-stone-900/80"
                >
                  {{ dueText(plan.deadline) }}
                  <span
                    v-if="relativeText(plan.deadline)"
                    class="text-stone-900/35"
                    >·</span
                  >
                  <span
                    class="plan-cover-rel"
                    :class="
                      relativeText(plan.deadline).startsWith('已逾期')
                        ? 'plan-cover-rel--overdue'
                        : ''
                    "
                    >{{ relativeText(plan.deadline) }}</span
                  >
                </p>
                <div class="mt-2 flex items-center gap-2">
                  <span
                    class="plan-status-pill"
                    :class="statusClass(plan.status)"
                  >
                    {{ plan.status }}
                  </span>
                </div>
                <p
                  v-if="plan.coverLine"
                  class="mt-2 line-clamp-1 text-[12px] font-medium text-stone-900/65"
                >
                  {{ plan.coverLine }}
                </p>
              </div>
            </div>
          </div>

          <div class="flex flex-1 flex-col p-5">
            <h2
              class="mb-2 line-clamp-2 text-lg font-bold leading-snug tracking-tight sm:text-xl"
              :class="titleColorClass(plan)"
            >
              {{ plan.title }}
            </h2>
            <p
              class="mb-5 line-clamp-3 text-[14px] leading-relaxed text-stone-600"
            >
              {{ plan.description }}
            </p>
            <div class="mt-auto">
              <div
                class="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-stone-500"
              >
                <span class="inline-flex items-center gap-1.5">
                  <span class="tabular-nums text-stone-800"
                    >{{ plan.progress }}%</span
                  >
                  <span class="text-stone-400">·</span>
                  <span>{{ dueText(plan.deadline) }}</span>
                </span>
                <span
                  v-if="relativeText(plan.deadline)"
                  class="tabular-nums"
                  :class="
                    relativeText(plan.deadline).startsWith('已逾期')
                      ? 'text-rose-700'
                      : 'text-stone-600'
                  "
                >
                  {{ relativeText(plan.deadline) }}
                </span>
              </div>
            </div>
          </div>
        </router-link>

        <div
          v-if="filteredPlans.length === 0"
          class="flex min-h-[280px] flex-col items-center justify-center rounded-3xl border border-dashed border-stone-300/90 bg-white/60 px-8 py-12 text-center lg:col-span-2"
          data-testid="plan-overview-empty"
        >
          <span
            v-if="!listLoading && plans.length === 0 && !searchText"
            class="material-symbols-outlined mb-3 text-4xl text-emerald-500/80"
            >calendar_add_on</span
          >
          <span
            v-else
            class="material-symbols-outlined mb-3 text-4xl text-stone-400"
            >search_off</span
          >
          <template v-if="!listLoading && plans.length === 0 && !searchText">
            <p class="text-lg font-semibold text-stone-800">从这里开始你的第一个计划</p>
            <p class="mt-2 max-w-md text-sm leading-relaxed text-stone-600">
              定稿后的计划会出现在本页；在「新建计划」里填写目标与要求、生成并确认，即可在详情里按时间槽打卡。全程可随时回到草稿继续改。
            </p>
          </template>
          <template v-else-if="searchText">
            <p class="text-lg font-semibold text-stone-800">没有匹配当前搜索的计划</p>
            <p class="mt-2 max-w-sm text-sm leading-relaxed text-stone-600">
              试试别的关键词，或清空顶栏搜索；已有计划时会在下方卡片中显示。
            </p>
          </template>
          <template v-else>
            <p class="text-lg font-semibold text-stone-800">这里暂时空空如也</p>
            <p class="mt-2 max-w-sm text-sm leading-relaxed text-stone-600">
              当前筛选下没有计划。可换一个标签，或新建一个计划，从小目标开始。
            </p>
          </template>
        </div>

        <router-link
          to="/plans/new"
          class="animate-plan-card group relative flex min-h-[300px] flex-col justify-between overflow-hidden rounded-3xl border border-emerald-400/30 bg-gradient-to-br from-primary via-[#5ef082] to-emerald-300 p-6 text-stone-900 shadow-[0_16px_40px_-18px_rgba(19,180,80,0.55)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_48px_-16px_rgba(19,160,70,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
          :style="{ '--stagger': `${filteredPlans.length * 45 + 60}ms` }"
        >
          <div
            class="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/25 blur-2xl"
          />
          <div
            class="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/5 to-transparent"
          />
          <div class="relative">
            <div
              class="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-900/10 shadow-inner ring-1 ring-white/40 backdrop-blur-[2px] transition group-hover:scale-105"
            >
              <span
                class="material-symbols-outlined text-3xl text-stone-900"
                style="font-variation-settings: 'wght' 600"
                >add</span
              >
            </div>
            <p
              class="text-2xl font-extrabold leading-tight tracking-tight sm:text-[1.65rem]"
            >
              新建一个<br /><span class="text-stone-800/90">属于你的计划</span>
            </p>
          </div>
          <p
            class="relative text-sm font-medium leading-relaxed text-stone-800/75"
          >
            不用一次想完所有步骤，先写下目标，后面再慢慢拆解。
          </p>
        </router-link>
      </div>
    </div>

    <!-- Action Sheet -->
    <div
      v-if="actionSheetOpen"
      class="fixed inset-0 z-50"
      data-testid="plan-action-sheet-root"
      @click="closeActionSheet"
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
              {{ actionSheetPlan?.title ?? "" }}
            </p>
          </div>
          <button
            type="button"
            class="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-stone-100 text-stone-700 ring-1 ring-stone-200/80 transition hover:bg-stone-200/70"
            aria-label="关闭"
            data-testid="action-sheet-close"
            @click="closeActionSheet"
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
            @click="actionSheetPlan && openConfirmArchive(actionSheetPlan)"
          >
            <span>归档计划</span>
            <span class="text-xs font-semibold text-slate-600/80"
              >只读</span
            >
          </button>
          <button
            type="button"
            class="flex w-full items-center justify-between rounded-2xl border border-rose-200/60 bg-rose-50/80 px-4 py-3 text-left text-sm font-extrabold text-rose-700 ring-1 ring-white/70 transition hover:bg-rose-50"
            data-testid="action-delete"
            @click="actionSheetPlan && openConfirmDelete(actionSheetPlan)"
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
            @click="closeActionSheet"
          >
            取消
          </button>
        </div>
      </div>
    </div>

    <UiConfirmDialog
      v-model="confirmDeleteOpen"
      title="确定删除该计划？"
      :description="confirmDeletePlan ? `「${confirmDeletePlan.title}」可在“最近删除”中恢复。` : '可在“最近删除”中恢复。'"
      confirm-text="删除"
      cancel-text="取消"
      danger
      :loading="confirmDeleteSubmitting"
      :close-on-confirm="false"
      data-testid="confirm-delete-dialog"
      @confirm="submitDeletePlan"
      @cancel="confirmDeleteOpen = false"
    />

    <UiConfirmDialog
      v-model="confirmArchiveOpen"
      title="将计划移入归档？"
      :description="confirmArchivePlan ? `「${confirmArchivePlan.title}」归档后将从列表隐藏，且不能继续打卡或编辑排期；可在“归档”中随时恢复执行。` : '归档后将从列表隐藏，且不能继续打卡或编辑排期；可在“归档”中随时恢复执行。'"
      confirm-text="确认归档"
      cancel-text="取消"
      :loading="confirmArchiveSubmitting"
      :close-on-confirm="false"
      data-testid="confirm-archive-dialog"
      @confirm="submitArchivePlan"
      @cancel="confirmArchiveOpen = false"
    />
  </div>
</template>

<style scoped>
.plan-home-grain {
  opacity: 0.04;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

/* —— 筛选 Tab：滑动白 pill + 轻弹性缓动 + 落位高光扫过（仅轨道，不涉及内容区） —— */
.plan-filter-rail-scroll {
  -webkit-overflow-scrolling: touch;
}

@media (prefers-reduced-motion: no-preference) {
  .plan-filter-rail {
    position: relative;
  }

  .plan-filter-rail::before {
    content: "";
    position: absolute;
    inset: -35% -45%;
    background: radial-gradient(
      circle at 35% 45%,
      rgba(52, 211, 153, 0.12),
      transparent 58%
    );
    pointer-events: none;
    opacity: 0.85;
    animation: plan-filter-rail-glow 7s ease-in-out infinite;
  }
}

@keyframes plan-filter-rail-glow {
  0%,
  100% {
    transform: translateX(-4%) scale(1);
    opacity: 0.65;
  }
  50% {
    transform: translateX(5%) scale(1.03);
    opacity: 0.95;
  }
}

.plan-filter-indicator {
  transition:
    left 0.48s cubic-bezier(0.34, 1.22, 0.64, 1),
    top 0.48s cubic-bezier(0.34, 1.22, 0.64, 1),
    width 0.42s cubic-bezier(0.34, 1.15, 0.64, 1),
    height 0.42s cubic-bezier(0.34, 1.15, 0.64, 1),
    opacity 0.18s ease,
    box-shadow 0.35s ease;
  will-change: left, top, width, height;
}

.plan-filter-indicator-shine {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(
    105deg,
    transparent 0%,
    transparent 38%,
    rgba(255, 255, 255, 0.65) 48%,
    rgba(255, 255, 255, 0.2) 52%,
    transparent 62%
  );
  animation: plan-filter-shine-sweep 0.58s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@media (prefers-reduced-motion: reduce) {
  .plan-filter-rail::before {
    display: none;
  }

  .plan-filter-indicator {
    transition:
      left 0.2s ease,
      top 0.2s ease,
      width 0.2s ease,
      height 0.2s ease,
      opacity 0.15s ease;
    will-change: auto;
  }

  .plan-filter-indicator-shine {
    display: none;
  }
}

@keyframes plan-filter-shine-sweep {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(100%);
  }
}

@keyframes plan-card-in {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-plan-card {
  animation: plan-card-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: var(--stagger, 0ms);
}

@media (prefers-reduced-motion: reduce) {
  .animate-plan-card {
    animation: none;
  }
}

/* —— 方案A/A2：无图封面（进度环 + 时间 + 状态） —— */
.plan-cover {
  min-height: 150px;
  border-bottom: 1px solid rgba(231, 236, 233, 0.85);
}

.plan-cover-inner {
  position: relative;
  z-index: 1;
}

.plan-cover-grain {
  position: absolute;
  inset: 0;
  opacity: 0.06;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  pointer-events: none;
}

.plan-cover-soft {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(
      ellipse 520px 220px at 18% 10%,
      rgba(255, 255, 255, 0.75),
      transparent 55%
    ),
    radial-gradient(
      ellipse 520px 240px at 86% 92%,
      rgba(255, 255, 255, 0.65),
      transparent 55%
    );
  opacity: 0.75;
}

.cover--active {
  background:
    radial-gradient(
      ellipse 520px 240px at 12% 0%,
      rgba(16, 185, 129, 0.22),
      transparent 58%
    ),
    radial-gradient(
      ellipse 520px 260px at 92% 100%,
      rgba(253, 230, 138, 0.14),
      transparent 55%
    ),
    linear-gradient(
      165deg,
      rgba(255, 255, 255, 0.92) 0%,
      rgba(240, 252, 246, 0.92) 100%
    );
}

.cover--idle {
  background:
    radial-gradient(
      ellipse 520px 240px at 12% 0%,
      rgba(148, 163, 156, 0.18),
      transparent 58%
    ),
    radial-gradient(
      ellipse 520px 260px at 92% 100%,
      rgba(226, 232, 228, 0.32),
      transparent 55%
    ),
    linear-gradient(
      165deg,
      rgba(255, 255, 255, 0.92) 0%,
      rgba(248, 250, 249, 0.92) 100%
    );
}

.cover--done {
  background:
    radial-gradient(
      ellipse 520px 240px at 12% 0%,
      rgba(20, 184, 166, 0.18),
      transparent 58%
    ),
    radial-gradient(
      ellipse 520px 260px at 92% 100%,
      rgba(16, 185, 129, 0.1),
      transparent 55%
    ),
    linear-gradient(
      165deg,
      rgba(255, 255, 255, 0.92) 0%,
      rgba(238, 252, 249, 0.92) 100%
    );
}

.plan-ring-wrap {
  position: relative;
  width: 52px;
  height: 52px;
}

.plan-ring {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background:
    conic-gradient(
      from 210deg,
      rgba(16, 185, 129, 0.95) calc(var(--p, 0) * 1%),
      rgba(16, 185, 129, 0.14) 0
    ),
    radial-gradient(
      circle at 35% 35%,
      rgba(255, 255, 255, 0.85),
      rgba(255, 255, 255, 0.55) 55%,
      transparent 60%
    );
  box-shadow:
    0 10px 24px -14px rgba(10, 143, 74, 0.38),
    0 0 0 1px rgba(16, 185, 129, 0.18) inset;
  -webkit-mask: radial-gradient(circle, transparent 62%, #000 64%);
  mask: radial-gradient(circle, transparent 62%, #000 64%);
}

.plan-ring-text {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.8) inset;
}

.plan-ring-num {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: rgba(15, 31, 22, 0.92);
}

.plan-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.32rem 0.55rem;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  backdrop-filter: blur(8px);
}

.plan-cover-rel {
  font-weight: 700;
  color: rgba(15, 31, 22, 0.72);
}

.plan-cover-rel--overdue {
  /* 逾期提醒更克制：暖色但不过度“报警红” */
  color: rgba(180, 83, 9, 0.92);
}

@media (prefers-reduced-motion: no-preference) {
  .plan-cover {
    transition:
      filter 0.35s ease,
      transform 0.35s ease;
  }

  .plan-home :deep([data-testid="plan-card"]:hover) .plan-cover-soft {
    opacity: 0.9;
  }

  .plan-home :deep([data-testid="plan-card"]:hover) .plan-ring {
    filter: brightness(1.04) saturate(1.05);
  }
}
</style>
