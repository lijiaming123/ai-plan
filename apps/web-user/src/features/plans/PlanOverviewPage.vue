<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageSectionHeading from "../../components/PageSectionHeading.vue";
import UiErrorToast from "../../components/UiErrorToast.vue";
import UiConfirmDialog from "../../components/UiConfirmDialog.vue";
import { getApiClient, type PlanListRow } from "../../lib/api-client";
import { buildPlanCardDisplayTexts } from "../../lib/plan-list-card-text";
import { useCloseOnEscape } from "../../composables/useCloseOnEscape";
import { authState } from "../../stores/auth";
import { planListSearchQuery } from "../../stores/plan-search-query";
import PlanListFilters from "./overview/PlanListFilters.vue";
import PlanListCard from "./overview/PlanListCard.vue";
import PlanListActionSheet from "./overview/PlanListActionSheet.vue";
import type {
  FilterType,
  PlanCard,
  StatusQuery,
} from "./overview/plan-list-types";

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

function rowToCard(row: PlanListRow): PlanCard {
  const deadline = deadlineDayFromIso(row.deadline);
  const { description, coverLine } = buildPlanCardDisplayTexts({
    requirement: row.requirement ?? "",
    type: row.type,
    goal: row.goal ?? "",
  });
  const completed = row.completed === true;
  const startIso = row.startDate ?? row.createdAt ?? row.deadline;
  const startMs = utcDayMsFromIso(startIso);
  const now = new Date();
  const nowMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const notStarted = startMs != null && nowMs < startMs;
  const timeProgress = computeTimeProgressPercent({
    startIso: row.createdAt ?? row.deadline,
    endIso: row.deadline,
  });
  const slotProgress =
    typeof row.checkinProgressPercent === "number" &&
    Array.isArray(row.checkinSegments) &&
    row.checkinSegments.length > 0
      ? row.checkinProgressPercent
      : null;
  return {
    id: row.id,
    title: row.goal,
    description,
    coverLine,
    deadline,
    image: "",
    progress: completed ? 100 : slotProgress ?? timeProgress,
    status: completed ? "已完成" : notStarted ? "未开始" : "执行中",
    type: row.type,
    todayMissing: row.todayMissing === true,
    checkinSegments: row.checkinSegments,
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
      const { plans: deletedPlans } = await getApiClient().listDeletedPlans({
        token: authState.token,
      });
      trashCount.value = deletedPlans.length;
    } catch {
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

function onActionSheetArchive() {
  if (actionSheetPlan.value) openConfirmArchive(actionSheetPlan.value);
}

function onActionSheetDelete() {
  if (actionSheetPlan.value) openConfirmDelete(actionSheetPlan.value);
}

function toggleDesktopMenu(planId: string) {
  desktopMenuPlanId.value =
    desktopMenuPlanId.value === planId ? null : planId;
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
  if (["全部", "执行中", "已完成", "未开始"].includes(status))
    return status as FilterType;
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

function onFilterChange(filter: FilterType) {
  activeFilter.value = filter;
  const nextQuery = { ...route.query };
  const q = filterToQuery(filter);
  if (!q) delete nextQuery.status;
  else nextQuery.status = q;
  router.replace({ query: nextQuery });
}

watch(
  () => route.query.status,
  (status) => {
    activeFilter.value = normalizeFilter(status);
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
</script>

<template>
  <div
    class="plan-home relative flex h-full min-h-0 w-full flex-col font-plan text-stone-800"
    data-testid="plan-overview-root"
    @click="closeDesktopMenu"
  >
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

      <PlanListFilters
        :active-filter="activeFilter"
        :trash-count="trashCount"
        @update:active-filter="onFilterChange"
      />
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
        <PlanListCard
          v-for="(plan, index) in filteredPlans"
          :key="plan.id"
          :plan="plan"
          :index="index"
          :desktop-menu-open="desktopMenuPlanId === plan.id"
          @open-action-sheet="openActionSheet"
          @toggle-desktop-menu="toggleDesktopMenu"
          @archive="openConfirmArchive"
          @delete="openConfirmDelete"
        />

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
              定稿后的计划会出现在本页；在「新建计划」里填写目标与要求、生成并确认，即可在详情里按打卡段逐项打卡。全程可随时回到草稿继续改。
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

    <PlanListActionSheet
      :open="actionSheetOpen"
      :plan-title="actionSheetPlan?.title ?? ''"
      @close="closeActionSheet"
      @archive="onActionSheetArchive"
      @delete="onActionSheetDelete"
    />

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
</style>
