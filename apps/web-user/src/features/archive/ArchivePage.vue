<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageSectionHeading from "../../components/PageSectionHeading.vue";
import UiConfirmDialog from "../../components/UiConfirmDialog.vue";
import UiErrorToast from "../../components/UiErrorToast.vue";
import {
  getApiClient,
  type ArchivedPlanListRow,
} from "../../lib/api-client";
import { authState } from "../../stores/auth";

type ArchivedCard = {
  id: string;
  goal: string;
  deadline: string;
  createdAt: string;
  archivedAt: string;
};

const PAGE_SIZE = 20;

const archivedPlans = ref<ArchivedCard[]>([]);
const hasMore = ref(false);
const listLoading = ref(true);
const loadingMore = ref(false);
const errorToastMessage = ref("");
const okBanner = ref("");
const searchQ = ref("");
const sortKey = ref<"archived" | "deadline">("archived");
/** 最近一次成功请求使用的搜索词（用于区分「真空」与「无匹配」） */
const appliedSearch = ref("");
const confirmUnarchiveOpen = ref(false);
const pendingUnarchive = ref<ArchivedCard | null>(null);
const confirmUnarchiveLoading = ref(false);
const faqOpen = ref(false);

let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const scrollRootEl = ref<HTMLElement | null>(null);
const loadMoreSentinelEl = ref<HTMLElement | null>(null);
const supportsInfiniteScroll = ref(false);
let loadMoreObserver: IntersectionObserver | null = null;
const showBackToTop = ref(false);
const loadMoreError = ref(false);
const loadMoreErrorMessage = ref("");
let scrollListener: ((e: Event) => void) | null = null;

const route = useRoute();
const router = useRouter();

function dayFromIso(iso: string): string {
  const d = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : iso;
}

function rowToCard(row: ArchivedPlanListRow): ArchivedCard {
  return {
    id: row.id,
    goal: row.goal,
    deadline: dayFromIso(row.deadline),
    createdAt: row.createdAt,
    archivedAt: dayFromIso(row.archivedAt),
  };
}

const isAuthed = computed(() => Boolean(authState.token));

const unarchiveConfirmDescription = computed(() => {
  const p = pendingUnarchive.value;
  if (!p) return "";
  return "将「" + p.goal + "」移回「我的计划」，可继续执行与打卡。";
});

async function fetchArchivedPage(append: boolean) {
  if (!authState.token) {
    archivedPlans.value = [];
    hasMore.value = false;
    listLoading.value = false;
    loadingMore.value = false;
    return;
  }

  if (append) {
    if (!hasMore.value || loadingMore.value || listLoading.value) return;
    loadingMore.value = true;
  } else {
    listLoading.value = true;
  }
  errorToastMessage.value = "";

  const searchTerm = searchQ.value.trim();
  const offset = append ? archivedPlans.value.length : 0;
  const previousScrollTop = append ? scrollRootEl.value?.scrollTop : undefined;

  try {
    const { plans, hasMore: more } = await getApiClient().listArchivedPlans({
      token: authState.token,
      sort: sortKey.value === "deadline" ? "deadline" : "created",
      limit: PAGE_SIZE,
      offset,
      search: searchTerm || undefined,
    });
    appliedSearch.value = searchTerm;
    const cards = plans.map(rowToCard);
    if (append) {
      archivedPlans.value = [...archivedPlans.value, ...cards];
    } else {
      archivedPlans.value = cards;
    }
    hasMore.value = more;
    loadMoreError.value = false;
    loadMoreErrorMessage.value = "";
    if (append && previousScrollTop != null) {
      await nextTick();
      const root = scrollRootEl.value;
      if (root) {
        root.scrollTop = previousScrollTop;
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "没能加载归档列表，请稍后再试";
    errorToastMessage.value = message;
    if (append) {
      loadMoreError.value = true;
      loadMoreErrorMessage.value = message;
    } else {
      archivedPlans.value = [];
      hasMore.value = false;
      appliedSearch.value = "";
      loadMoreError.value = false;
      loadMoreErrorMessage.value = "";
    }
  } finally {
    listLoading.value = false;
    loadingMore.value = false;
  }
}

function scrollToTop() {
  const root = scrollRootEl.value;
  if (!root) return;
  // user-triggered filter change：直接跳到顶部（不做 smooth，避免大量内容时卡顿）
  root.scrollTop = 0;
}

function teardownInfiniteScroll() {
  if (loadMoreObserver) {
    loadMoreObserver.disconnect();
    loadMoreObserver = null;
  }
}

function setupInfiniteScroll() {
  teardownInfiniteScroll();

  const root = scrollRootEl.value;
  const sentinel = loadMoreSentinelEl.value;
  if (!root || !sentinel) return;
  if (typeof window === "undefined") return;
  if (typeof window.IntersectionObserver !== "function") return;

  supportsInfiniteScroll.value = true;
  loadMoreObserver = new window.IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (!entry) return;
      if (!entry.isIntersecting) return;
      if (loadMoreError.value) return;
      void fetchArchivedPage(true);
    },
    {
      root,
      // 提前一点触发，避免用户看到“空白等待”
      rootMargin: "220px 0px",
      threshold: 0.01,
    },
  );
  loadMoreObserver.observe(sentinel);
}

function scheduleSearchReload() {
  if (searchDebounceTimer != null) {
    window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }
  searchDebounceTimer = window.setTimeout(() => {
    searchDebounceTimer = null;
    void syncQueryToUrl();
    scrollToTop();
    void fetchArchivedPage(false);
  }, 320);
}

async function syncQueryToUrl() {
  const q = searchQ.value.trim();
  const nextQuery: Record<string, string> = {};
  if (sortKey.value === "deadline") nextQuery.sort = "deadline";
  if (q) nextQuery.q = q;
  // 避免重复 replace 触发无意义导航
  const curSort = typeof route.query.sort === "string" ? route.query.sort : "";
  const curQ = typeof route.query.q === "string" ? route.query.q : "";
  const nextSort = nextQuery.sort ?? "";
  const nextQ = nextQuery.q ?? "";
  if (curSort === nextSort && curQ === nextQ) return;
  await router.replace({ query: nextQuery });
}

function openUnarchiveConfirm(plan: ArchivedCard) {
  pendingUnarchive.value = plan;
  confirmUnarchiveOpen.value = true;
}

async function onConfirmUnarchive() {
  const plan = pendingUnarchive.value;
  if (!plan || !authState.token) {
    confirmUnarchiveOpen.value = false;
    return;
  }
  confirmUnarchiveLoading.value = true;
  try {
    await getApiClient().unarchivePlan({
      id: plan.id,
      token: authState.token,
    });
    archivedPlans.value = archivedPlans.value.filter((p) => p.id !== plan.id);
    okBanner.value = "已移回「我的计划」，可继续执行与打卡。";
    window.setTimeout(() => {
      okBanner.value = "";
    }, 3200);
    confirmUnarchiveOpen.value = false;
    pendingUnarchive.value = null;
  } catch (e) {
    errorToastMessage.value =
      e instanceof Error ? e.message : "没恢复成功，请稍后再试";
  } finally {
    confirmUnarchiveLoading.value = false;
  }
}

function setupBackToTop() {
  const root = scrollRootEl.value;
  if (!root) return;
  if (scrollListener) {
    root.removeEventListener("scroll", scrollListener);
  }
  scrollListener = () => {
    showBackToTop.value = root.scrollTop > 420;
  };
  root.addEventListener("scroll", scrollListener, { passive: true });
  // 初始化一次
  showBackToTop.value = root.scrollTop > 420;
}

function teardownBackToTop() {
  const root = scrollRootEl.value;
  if (!root || !scrollListener) return;
  root.removeEventListener("scroll", scrollListener);
  scrollListener = null;
}

function retryInitialLoad() {
  errorToastMessage.value = "";
  void fetchArchivedPage(false);
}

function retryLoadMore() {
  loadMoreError.value = false;
  loadMoreErrorMessage.value = "";
  errorToastMessage.value = "";
  void fetchArchivedPage(true);
}

onMounted(() => {
  // 从 URL 恢复筛选条件（刷新/返回时不丢）
  const rawSort = typeof route.query.sort === "string" ? route.query.sort : "";
  const rawQ = typeof route.query.q === "string" ? route.query.q : "";
  if (rawSort === "deadline") sortKey.value = "deadline";
  if (rawQ) searchQ.value = rawQ.slice(0, 120);

  void fetchArchivedPage(false);
  supportsInfiniteScroll.value =
    typeof window !== "undefined" &&
    typeof window.IntersectionObserver === "function";
  // 等首次渲染完成后再绑定 observer，避免 ref 还未挂载
  void nextTick().then(() => {
    setupInfiniteScroll();
    setupBackToTop();
  });
});

onUnmounted(() => {
  if (searchDebounceTimer != null) {
    window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }
  teardownInfiniteScroll();
  teardownBackToTop();
});

watch(sortKey, () => {
  void syncQueryToUrl();
  scrollToTop();
  void fetchArchivedPage(false);
});

watch(searchQ, () => {
  scheduleSearchReload();
});

watch(confirmUnarchiveOpen, (open) => {
  if (!open) {
    pendingUnarchive.value = null;
  }
});

watch(
  () => [archivedPlans.value.length, hasMore.value, listLoading.value],
  () => {
    // 列表从空到有/加载结束后，哨兵节点可能才出现，重新绑定 observer
    void nextTick().then(() => {
      setupInfiniteScroll();
      setupBackToTop();
    });
  },
);
</script>

<template>
  <div
    class="flex h-full min-h-0 w-full flex-col font-plan text-stone-800"
    data-testid="plan-archive-root"
  >
    <UiConfirmDialog
      v-model="confirmUnarchiveOpen"
      title="移回我的计划？"
      :description="unarchiveConfirmDescription"
      confirm-text="移回"
      cancel-text="取消"
      :loading="confirmUnarchiveLoading"
      :close-on-confirm="false"
      @confirm="onConfirmUnarchive"
    />

    <header class="mb-6 shrink-0 sm:mb-8">
      <PageSectionHeading kicker="历史与回顾" title="归档">
        <p>
          已归档的计划会移出「我的计划」列表，便于收尾与回顾；需要继续执行时可随时移回。
        </p>
      </PageSectionHeading>

      <div class="mt-3 rounded-3xl border border-stone-200/80 bg-white/60 p-4 ring-1 ring-white/70">
        <button
          type="button"
          class="flex w-full items-center justify-between gap-3 text-left text-sm font-bold text-stone-800"
          data-testid="archive-faq-toggle"
          @click="faqOpen = !faqOpen"
        >
          <span>了解归档</span>
          <span class="text-stone-500" aria-hidden="true">{{
            faqOpen ? "收起" : "展开"
          }}</span>
        </button>
        <div
          v-if="faqOpen"
          class="mt-3 space-y-3 text-sm text-stone-700"
          data-testid="archive-faq-body"
        >
          <div>
            <p class="font-bold text-stone-900">归档和删除有什么区别？</p>
            <p class="mt-1 text-stone-600">
              归档用于收尾与回顾，随时可移回继续执行；删除用于清理，需要从回收站恢复。
            </p>
          </div>
          <div>
            <p class="font-bold text-stone-900">归档后为什么不能打卡/编辑？</p>
            <p class="mt-1 text-stone-600">
              归档表示本计划进入只读回顾状态；需要继续时先移回「我的计划」。
            </p>
          </div>
          <div>
            <p class="font-bold text-stone-900">怎么恢复继续执行？</p>
            <p class="mt-1 text-stone-600">
              在归档列表点击「移回我的计划」即可继续。
            </p>
          </div>
          <div>
            <p class="font-bold text-stone-900">归档会丢数据吗？</p>
            <p class="mt-1 text-stone-600">
              不会。归档仅改变存放位置与可编辑状态。
            </p>
          </div>
        </div>
      </div>

      <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-1 flex-wrap items-center gap-2">
          <div class="relative w-full min-w-[220px] max-w-[360px] flex-1">
            <span
              class="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-stone-400"
              aria-hidden="true"
              >search</span
            >
            <input
              v-model="searchQ"
              type="search"
              class="h-10 w-full rounded-2xl border border-stone-200/80 bg-white/80 pl-10 pr-3 text-sm font-medium text-stone-800 ring-1 ring-white/70 backdrop-blur-sm outline-none transition focus:border-emerald-300/80 focus:ring-2 focus:ring-emerald-200/50"
              placeholder="搜索归档计划…"
              data-testid="archive-search"
            />

            <button
              v-if="searchQ.trim()"
              type="button"
              class="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl bg-white/70 text-stone-600 ring-1 ring-stone-200/70 transition hover:bg-white hover:text-stone-900"
              aria-label="清空搜索"
              data-testid="archive-search-clear"
              @click="searchQ = ''"
            >
              <span class="material-symbols-outlined text-[18px]" aria-hidden="true"
                >close</span
              >
            </button>
          </div>

          <label class="inline-flex items-center gap-2 text-sm font-semibold text-stone-600">
            <span class="sr-only">排序</span>
            <select
              v-model="sortKey"
              class="h-10 rounded-2xl border border-stone-200/80 bg-white/80 px-3 text-sm font-semibold text-stone-700 ring-1 ring-white/70 backdrop-blur-sm outline-none transition focus:border-emerald-300/80 focus:ring-2 focus:ring-emerald-200/50"
              data-testid="archive-sort"
            >
              <option value="archived">按归档时间</option>
              <option value="deadline">按截止日期</option>
            </select>
          </label>
        </div>

        <router-link
          to="/plans"
          class="inline-flex items-center gap-2 rounded-2xl bg-white/40 px-2.5 py-2 text-sm font-semibold text-stone-600 ring-1 ring-white/60 backdrop-blur-sm transition hover:bg-white/65 hover:text-stone-900"
          data-testid="back-to-plans-from-archive"
        >
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true"
            >arrow_back</span
          >
          返回我的计划
        </router-link>
      </div>
    </header>

    <UiErrorToast
      :message="errorToastMessage"
      @close="errorToastMessage = ''"
    />

    <div
      v-if="errorToastMessage && !listLoading"
      class="mb-3 flex items-center justify-end"
    >
      <button
        type="button"
        class="rounded-2xl border border-stone-200/80 bg-white/70 px-3 py-2 text-sm font-bold text-stone-800 ring-1 ring-white/70 transition hover:bg-white"
        data-testid="archive-retry"
        @click="retryInitialLoad"
      >
        重试加载
      </button>
    </div>

    <div
      ref="scrollRootEl"
      class="ui-scrollbar min-h-0 flex-1 overflow-y-auto pr-1 pb-2"
    >
      <div
        v-if="okBanner"
        class="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-emerald-200/70 bg-emerald-50/70 px-4 py-3 text-sm font-semibold text-emerald-950 ring-1 ring-white/70"
        data-testid="plan-archive-ok-banner"
      >
        <span class="min-w-0 truncate">{{ okBanner }}</span>
        <button
          type="button"
          class="shrink-0 rounded-xl bg-white/70 px-3 py-1.5 text-sm font-semibold text-emerald-900 ring-1 ring-emerald-200/70 transition hover:bg-white"
          aria-label="关闭提示"
          @click="okBanner = ''"
        >
          关闭
        </button>
      </div>

      <div
        v-if="listLoading"
        class="flex min-h-[220px] flex-col items-center justify-center gap-2 text-stone-500"
      >
        <span
          class="inline-block h-8 w-8 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600"
          aria-hidden="true"
        />
        <span class="text-sm font-medium">加载归档中…</span>
      </div>

      <div v-else class="space-y-4">
        <div
          v-if="!isAuthed"
          class="flex min-h-[240px] flex-col items-center justify-center rounded-3xl border border-dashed border-stone-300/90 bg-white/60 px-8 py-12 text-center"
          data-testid="plan-archive-login-hint"
        >
          <span class="text-lg font-semibold text-stone-800">请先登录</span>
          <span class="mt-2 text-sm leading-relaxed text-stone-600"
            >登录后可查看已归档的计划。</span
          >
        </div>

        <div
          v-else-if="archivedPlans.length === 0 && !appliedSearch"
          class="flex min-h-[240px] flex-col items-center justify-center rounded-3xl border border-dashed border-stone-300/90 bg-white/60 px-8 py-12 text-center"
          data-testid="archive-empty"
        >
          <span class="text-lg font-semibold text-stone-800">暂无归档计划</span>
          <span class="mt-2 text-sm leading-relaxed text-stone-600"
            >在计划详情页可将不再活跃的计划移入归档。</span
          >
          <router-link
            to="/plans"
            class="mt-5 inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-[0_10px_24px_-16px_rgba(16,185,129,0.65)] transition hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            data-testid="empty-go-plans-archive"
          >
            回到我的计划
          </router-link>
        </div>

        <div
          v-else-if="archivedPlans.length === 0 && appliedSearch"
          class="flex min-h-[240px] flex-col items-center justify-center rounded-3xl border border-dashed border-stone-300/90 bg-white/60 px-8 py-12 text-center"
          data-testid="archive-search-empty"
        >
          <span class="text-lg font-semibold text-stone-800">没有匹配的归档计划</span>
          <span class="mt-2 text-sm leading-relaxed text-stone-600"
            >试试换个关键词，或清空搜索框。</span
          >
        </div>

        <template v-else>
          <ul class="space-y-3" data-testid="plan-archive-list">
            <li
              v-for="p in archivedPlans"
              :key="p.id"
              class="rounded-2xl border border-stone-200/80 bg-white/90 p-4 shadow-sm ring-1 ring-white/80"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0">
                  <router-link
                    :to="`/plans/${p.id}`"
                    class="text-base font-bold text-stone-900 underline-offset-2 hover:text-emerald-800 hover:underline"
                    :data-testid="`archive-plan-link-${p.id}`"
                  >
                    {{ p.goal }}
                  </router-link>
                  <p class="mt-1 text-xs text-stone-500">
                    截止 {{ p.deadline }} · 归档于 {{ p.archivedAt }}
                  </p>
                </div>
                <div class="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    class="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
                    :data-testid="`archive-unarchive-${p.id}`"
                    @click="openUnarchiveConfirm(p)"
                  >
                    移回我的计划
                  </button>
                </div>
              </div>
            </li>
          </ul>

          <div v-if="hasMore" class="pt-2">
            <div
              ref="loadMoreSentinelEl"
              class="h-px w-full"
              data-testid="archive-load-more-sentinel"
            />

            <div class="flex justify-center">
              <button
                v-if="loadMoreError"
                type="button"
                class="rounded-2xl border border-rose-200/80 bg-rose-50/60 px-4 py-2 text-sm font-bold text-rose-800 ring-1 ring-white/70 transition hover:bg-rose-50"
                data-testid="archive-load-more-retry"
                @click="retryLoadMore"
              >
                {{ loadMoreErrorMessage || "没能加载更多" }}，点此重试
              </button>

              <div v-if="loadingMore" class="w-full space-y-3" data-testid="archive-loading-more">
                <div
                  v-for="i in 3"
                  :key="i"
                  class="rounded-2xl border border-stone-200/80 bg-white/80 p-4 shadow-sm ring-1 ring-white/80"
                >
                  <div class="animate-pulse space-y-2">
                    <div class="h-4 w-2/3 rounded bg-stone-200/80" />
                    <div class="h-3 w-1/2 rounded bg-stone-100" />
                  </div>
                </div>
              </div>

              <button
                v-else-if="!supportsInfiniteScroll && !loadMoreError"
                type="button"
                class="rounded-2xl border border-stone-200/80 bg-white/80 px-4 py-2 text-sm font-bold text-stone-800 ring-1 ring-white/70 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="archive-load-more"
                :disabled="loadingMore"
                @click="fetchArchivedPage(true)"
              >
                加载更多
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>

    <button
      v-if="showBackToTop"
      type="button"
      class="fixed bottom-5 right-5 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#111813] text-white shadow-lg ring-1 ring-black/10 transition hover:bg-black"
      aria-label="回到顶部"
      data-testid="archive-back-to-top"
      @click="scrollToTop"
    >
      <span class="material-symbols-outlined text-[20px]" aria-hidden="true"
        >arrow_upward</span
      >
    </button>
  </div>
</template>
