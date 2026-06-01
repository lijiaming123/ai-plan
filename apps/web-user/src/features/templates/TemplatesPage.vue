<script setup lang="ts">
import PageSectionHeading from "../../components/PageSectionHeading.vue";
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { MarketTemplateBrief, PresetTemplateBrief } from '../../lib/api-client';
import { getApiClient } from '../../lib/api-client';
import { trackEvent } from '../../lib/telemetry';
import { authState } from '../../stores/auth';
import UiErrorToast from '../../components/UiErrorToast.vue';
import TemplateMarketList from './TemplateMarketList.vue';

const router = useRouter();
const route = useRoute();
const client = getApiClient();

type MainTab = 'mine' | 'market';
type MyScope = 'created' | 'favorited' | 'liked';

const publishBanner = ref(false);
const errorToastMessage = ref('');
const mainTab = ref<MainTab>('market');
const myScope = ref<MyScope>('created');

const presets = ref<PresetTemplateBrief[]>([]);
const marketItems = ref<MarketTemplateBrief[]>([]);
const myItems = ref<MarketTemplateBrief[]>([]);

const loadingPresets = ref(false);
const loadingMarket = ref(true);
const loadingMy = ref(false);

const searchQ = ref('');
const filterCategory = ref('');
const filterTag = ref('');
const marketSort = ref<'likes' | 'new'>('new');
const marketPage = ref(1);
const marketTotal = ref(0);
const myTotal = ref(0);
const PAGE_SIZE = 20;

const HOT_TAGS = [
  '学习',
  '旅游',
  '考试',
  '工作',
  '项目',
  '健身',
  '英语',
  '编程',
  '复盘',
] as const;
const CATEGORY_OPTIONS = [
  '',
  'general',
  'study',
  'travel',
  'work',
  'exam',
  'fitness',
  'other',
] as const;

const categoryLabel: Record<string, string> = {
  '': '分类',
  general: '通用',
  study: '学习',
  travel: '旅游',
  work: '工作',
  exam: '考试',
  fitness: '运动',
  other: '其他',
};

const hasFilters = computed(() => {
  return Boolean(searchQ.value.trim() || filterCategory.value.trim() || filterTag.value.trim());
});

function clearFilters() {
  searchQ.value = '';
  filterCategory.value = '';
  filterTag.value = '';
  marketSort.value = 'new';
  marketPage.value = 1;
  refreshActiveLists();
}

function setTagQuick(tag: string) {
  filterTag.value = tag;
}

const currentTotal = computed(() => (mainTab.value === 'market' ? marketTotal.value : myTotal.value));
const totalPages = computed(() => Math.max(1, Math.ceil(currentTotal.value / PAGE_SIZE)));
const pageLabel = computed(() => `第 ${marketPage.value} / ${totalPages.value} 页`);
const canPrev = computed(() => marketPage.value > 1);
const canNext = computed(() => marketPage.value < totalPages.value);

function prevPage() {
  if (!canPrev.value) return;
  marketPage.value -= 1;
}
function nextPage() {
  if (!canNext.value) return;
  marketPage.value += 1;
}

const loggedIn = computed(() => Boolean(authState.token));

async function loadPresets() {
  loadingPresets.value = true;
  try {
    const res = await client.listPresets(
      filterCategory.value.trim() ? { category: filterCategory.value.trim() } : undefined,
    );
    presets.value = res.items;
  } catch (e) {
    errorToastMessage.value = e instanceof Error ? e.message : '没能加载模板，请稍后再试';
  } finally {
    loadingPresets.value = false;
  }
}

async function loadMarket() {
  loadingMarket.value = true;
  try {
    const res = await client.listMarketTemplates({
      q: searchQ.value.trim() || undefined,
      category: filterCategory.value.trim() || undefined,
      tag: filterTag.value.trim() || undefined,
      sort: marketSort.value,
      page: marketPage.value,
      pageSize: PAGE_SIZE,
      token: authState.token || undefined,
    });
    marketItems.value = res.items;
    marketTotal.value = res.total;
  } catch (e) {
    errorToastMessage.value = e instanceof Error ? e.message : '没能加载模板，请稍后再试';
  } finally {
    loadingMarket.value = false;
  }
}

async function loadMy() {
  if (!authState.token) return;
  loadingMy.value = true;
  try {
    const res = await client.listMyMarketTemplates({
      token: authState.token,
      scope: myScope.value,
      q: searchQ.value.trim() || undefined,
      category: filterCategory.value.trim() || undefined,
      tag: filterTag.value.trim() || undefined,
      sort: marketSort.value,
      page: marketPage.value,
      pageSize: PAGE_SIZE,
    });
    myItems.value = res.items;
    myTotal.value = res.total;
  } catch (e) {
    errorToastMessage.value = e instanceof Error ? e.message : '没能加载模板，请稍后再试';
  } finally {
    loadingMy.value = false;
  }
}

function refreshActiveLists() {
  if (mainTab.value === 'market') {
    void loadPresets();
    void loadMarket();
  } else if (loggedIn.value) {
    void loadMy();
  }
}

onMounted(() => {
  if (route.query.published === '1') {
    publishBanner.value = true;
    void router.replace({ path: route.path, query: {} });
  }
  void loadMarket();
  void loadPresets();
});

watch(mainTab, (tab) => {
  marketPage.value = 1;
  if (tab === 'market') {
    void loadPresets();
    void loadMarket();
  } else if (loggedIn.value) {
    void loadMy();
  }
});

watch(myScope, () => {
  if (mainTab.value === 'mine' && loggedIn.value) {
    marketPage.value = 1;
    void loadMy();
  }
});

watch([filterCategory], () => {
  marketPage.value = 1;
  refreshActiveLists();
});

watch([marketSort, marketPage], () => {
  if (mainTab.value === 'market') void loadMarket();
  else if (mainTab.value === 'mine' && loggedIn.value) void loadMy();
});

let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(searchQ, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    marketPage.value = 1;
    refreshActiveLists();
  }, 320);
});

watch(filterTag, () => {
  marketPage.value = 1;
  refreshActiveLists();
});

watch(loggedIn, (v) => {
  if (v && mainTab.value === 'market') void loadMarket();
  if (v && mainTab.value === 'mine') void loadMy();
});

function goLogin() {
  void router.push('/auth/login');
}

function patchItemInLists(id: string, patch: Partial<MarketTemplateBrief>) {
  const lists = [marketItems, myItems] as const;
  for (const list of lists) {
    const idx = list.value.findIndex((x) => x.id === id);
    if (idx >= 0) {
      list.value[idx] = { ...list.value[idx]!, ...patch };
    }
  }
}

async function applyPreset(id: string) {
  if (!loggedIn.value) {
    goLogin();
    return;
  }
  try {
    const { planId } = await client.applyPresetTemplate({ id, token: authState.token });
    trackEvent('template_use', {
      properties: {
        templateId: id,
        templateSource: 'preset',
        planId,
      },
    });
    await router.push(`/plans/${planId}`);
  } catch (e) {
    errorToastMessage.value = e instanceof Error ? e.message : '没能套用模板，请稍后再试';
  }
}

async function applyMarket(id: string) {
  if (!loggedIn.value) {
    goLogin();
    return;
  }
  try {
    const { planId } = await client.applyMarketTemplate({ id, token: authState.token });
    trackEvent('template_use', {
      properties: {
        templateId: id,
        templateSource: 'market',
        planId,
      },
    });
    await router.push(`/plans/${planId}`);
  } catch (e) {
    errorToastMessage.value = e instanceof Error ? e.message : '没能套用模板，请稍后再试';
  }
}

type TemplateDetailFrom = 'market_list' | 'my_created' | 'my_favorited' | 'my_liked' | 'preset_list';

function openMarketDetail(id: string, from: TemplateDetailFrom) {
  trackEvent('template_detail_click', {
    properties: {
      templateId: id,
      from,
    },
  });
  void router.push(`/templates/market/${encodeURIComponent(id)}`);
}

function openPresetDetail(id: string) {
  trackEvent('template_detail_click', {
    properties: {
      templateId: id,
      from: 'preset_list',
    },
  });
  void router.push(`/templates/presets/${encodeURIComponent(id)}`);
}

function setMarketSort(value: 'likes' | 'new') {
  marketSort.value = value;
}

function switchToNewSort() {
  marketSort.value = 'new';
}

function switchToLikesSort() {
  marketSort.value = 'likes';
}

async function onToggleLike(id: string) {
  if (!loggedIn.value) {
    goLogin();
    return;
  }
  const item = marketItems.value.find((x) => x.id === id) ?? myItems.value.find((x) => x.id === id);
  if (!item) return;
  try {
    if (item.likedByMe) {
      const r = await client.unlikeMarketTemplate({ id, token: authState.token });
      patchItemInLists(id, { likedByMe: false, likeCount: r.likeCount });
    } else {
      const r = await client.likeMarketTemplate({ id, token: authState.token });
      patchItemInLists(id, { likedByMe: true, likeCount: r.likeCount });
    }
  } catch (e) {
    errorToastMessage.value = e instanceof Error ? e.message : '没操作成功，请稍后再试';
  }
}

async function onToggleFavorite(id: string) {
  if (!loggedIn.value) {
    goLogin();
    return;
  }
  const item = marketItems.value.find((x) => x.id === id) ?? myItems.value.find((x) => x.id === id);
  if (!item) return;
  try {
    if (item.favorited) {
      await client.unfavoriteMarketTemplate({ id, token: authState.token });
      patchItemInLists(id, { favorited: false });
    } else {
      await client.favoriteMarketTemplate({ id, token: authState.token });
      patchItemInLists(id, { favorited: true });
    }
  } catch (e) {
    errorToastMessage.value = e instanceof Error ? e.message : '收藏没成功，请稍后再试';
  }
}

const editingTemplate = ref<MarketTemplateBrief | null>(null);
const editSubmitting = ref(false);
const editForm = ref({
  title: '',
  summary: '',
  category: '',
  tags: '',
});

function openEdit(id: string) {
  const item = myItems.value.find((x) => x.id === id);
  if (!item) return;
  editingTemplate.value = item;
  editForm.value = {
    title: item.title ?? '',
    summary: item.summary ?? '',
    category: item.category ?? 'general',
    tags: (item.tags ?? []).join(','),
  };
}

function closeEdit() {
  editingTemplate.value = null;
}

async function submitEdit() {
  if (!editingTemplate.value || !authState.token) return;
  const title = editForm.value.title.trim();
  const summary = editForm.value.summary.trim();
  if (!title) {
    errorToastMessage.value = '标题不能为空';
    return;
  }
  if (!summary) {
    errorToastMessage.value = '摘要不能为空';
    return;
  }
  const tags = editForm.value.tags
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
  editSubmitting.value = true;
  try {
    await client.patchMarketTemplate({
      id: editingTemplate.value.id,
      token: authState.token,
      title,
      summary,
      category: editForm.value.category.trim() || 'general',
      tags,
    });
    patchItemInLists(editingTemplate.value.id, {
      title,
      summary,
      category: editForm.value.category.trim() || 'general',
      tags,
      status: 'pending_review',
    });
    closeEdit();
  } catch (e) {
    errorToastMessage.value = e instanceof Error ? e.message : '编辑没成功，请稍后再试';
  } finally {
    editSubmitting.value = false;
  }
}

async function onUnpublish(id: string) {
  if (!authState.token) return;
  try {
    await client.unpublishMarketTemplate({ id, token: authState.token });
    patchItemInLists(id, { status: 'unpublished', publishedAt: null });
  } catch (e) {
    errorToastMessage.value = e instanceof Error ? e.message : '下架没成功，请稍后再试';
  }
}

async function onResubmit(id: string) {
  if (!authState.token) return;
  const item = myItems.value.find((x) => x.id === id);
  if (!item) return;
  try {
    await client.patchMarketTemplate({
      id,
      token: authState.token,
      title: item.title,
      summary: item.summary,
      category: item.category,
      tags: item.tags,
    });
    patchItemInLists(id, { status: 'pending_review' });
  } catch (e) {
    errorToastMessage.value = e instanceof Error ? e.message : '重新提交没成功，请稍后再试';
  }
}

const myScopeLabel: Record<MyScope, string> = {
  created: '我创建的',
  favorited: '我收藏的',
  liked: '我点赞的',
};

const myScopeOptions: MyScope[] = ['created', 'favorited', 'liked'];
</script>

<template>
  <div class="flex h-full min-h-0 w-full flex-col font-plan text-stone-800">
    <div class="shrink-0 space-y-4 sm:space-y-5">
    <div
      v-if="publishBanner"
      class="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 px-4 py-3 text-sm font-semibold text-emerald-950 ring-1 ring-white/70"
      data-testid="published-banner"
    >
      <span class="material-symbols-outlined mr-1.5 inline-block align-middle text-[#0a8f4a]" aria-hidden="true"
        >check_circle</span
      >
      已发布到模板市场。切换到「模板市场」即可浏览系统预设与用户模板。
      <button
        type="button"
        class="ml-2 font-semibold text-emerald-800 underline underline-offset-2 hover:text-emerald-950"
        @click="publishBanner = false"
      >
        知道了
      </button>
    </div>

    <header class="mb-6 flex flex-col gap-4 sm:mb-8 lg:flex-row lg:items-start lg:justify-between">
      <PageSectionHeading class="min-w-0 lg:max-w-[min(100%,28rem)]" kicker="模板与复用" title="模板">
        <p>套用系统预设或社区模板；在「我的模板」查看已发布、收藏与点赞。</p>
      </PageSectionHeading>
      <div
        class="flex w-full shrink-0 rounded-3xl border border-stone-200/80 bg-white/60 p-1 ring-1 ring-white/70 shadow-sm backdrop-blur-sm sm:w-auto"
        role="tablist"
        aria-label="模板视图"
      >
        <button
          type="button"
          role="tab"
          data-testid="tab-mine"
          class="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition duration-200 sm:flex-none sm:px-5"
          :class="
            mainTab === 'mine'
              ? 'bg-white text-stone-900 shadow-sm ring-1 ring-emerald-200/70'
              : 'text-stone-600 hover:bg-white/80 hover:text-stone-900'
          "
          :aria-selected="mainTab === 'mine'"
          @click="mainTab = 'mine'"
        >
          <span class="material-symbols-outlined text-[20px] text-[#0a8f4a]" aria-hidden="true">folder_special</span>
          我的模板
        </button>
        <button
          type="button"
          role="tab"
          data-testid="tab-market"
          class="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition duration-200 sm:flex-none sm:px-5"
          :class="
            mainTab === 'market'
              ? 'bg-white text-stone-900 shadow-sm ring-1 ring-emerald-200/70'
              : 'text-stone-600 hover:bg-white/80 hover:text-stone-900'
          "
          :aria-selected="mainTab === 'market'"
          @click="mainTab = 'market'"
        >
          <span class="material-symbols-outlined text-[20px] text-[#0a8f4a]" aria-hidden="true">storefront</span>
          模板市场
        </button>
      </div>
    </header>
    </div>

    <UiErrorToast :message="errorToastMessage" @close="errorToastMessage = ''" />

    <div class="ui-scrollbar min-h-0 flex-1 overflow-y-auto pr-1 pb-2">
    <div
      class="sticky top-0 z-20 -mx-1 mb-6 rounded-3xl border border-stone-200/80 bg-white/60 p-4 ring-1 ring-white/70 shadow-sm backdrop-blur-sm sm:mx-0"
      data-testid="template-filter-bar"
    >
      <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div class="relative min-w-0 flex-1">
        <span
          class="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-stone-400"
          aria-hidden="true"
          >search</span
        >
        <input
          v-model="searchQ"
          type="search"
          placeholder="搜索标题或摘要…"
          class="h-10 w-full rounded-2xl border border-stone-200/80 bg-white/80 pl-10 pr-10 text-sm font-medium text-stone-800 ring-1 ring-white/70 outline-none transition placeholder:text-stone-400 focus:border-emerald-300/80 focus:ring-2 focus:ring-emerald-200/50"
          data-testid="template-search"
        />
        <button
          v-if="searchQ.trim()"
          type="button"
          class="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl bg-white/70 text-stone-600 ring-1 ring-stone-200/70 transition hover:bg-white hover:text-stone-900"
          aria-label="清空搜索"
          data-testid="template-search-clear"
          @click="searchQ = ''"
        >
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
        </button>
      </div>
      <select
        v-model="filterCategory"
        class="h-10 w-full rounded-2xl border border-stone-200/80 bg-white/80 px-3 text-sm font-semibold text-stone-700 ring-1 ring-white/70 outline-none transition focus:border-emerald-300/80 focus:ring-2 focus:ring-emerald-200/50 sm:w-40"
        data-testid="template-category"
      >
        <option v-for="c in CATEGORY_OPTIONS" :key="c" :value="c">
          {{ categoryLabel[c] ?? c }}
        </option>
      </select>
      <label class="relative w-full sm:w-44">
        <input
          v-model="filterTag"
          list="template-tag-options"
          type="text"
          placeholder="标签"
          class="h-10 w-full rounded-2xl border border-stone-200/80 bg-white/80 px-3 text-sm font-medium text-stone-800 ring-1 ring-white/70 outline-none transition placeholder:text-stone-400 focus:border-emerald-300/80 focus:ring-2 focus:ring-emerald-200/50"
          data-testid="template-tag"
        />
        <datalist id="template-tag-options">
          <option v-for="t in HOT_TAGS" :key="t" :value="t" />
        </datalist>
      </label>

      <button
        v-if="hasFilters"
        type="button"
        class="inline-flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-stone-200/80 bg-white/70 px-3 text-sm font-semibold text-stone-800 ring-1 ring-white/70 transition hover:bg-white sm:ml-auto"
        data-testid="template-clear-filters"
        @click="clearFilters"
      >
        <span class="material-symbols-outlined text-[18px]" aria-hidden="true">filter_alt_off</span>
        清空筛选
      </button>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-200/60 pt-3">
        <span class="text-xs font-semibold text-stone-500">热门标签</span>
        <button
          v-for="t in HOT_TAGS"
          :key="t"
          type="button"
          class="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700 ring-1 ring-stone-200/70 transition hover:bg-emerald-50 hover:text-emerald-900"
          :class="filterTag.trim() === t ? 'bg-emerald-50 text-emerald-900 ring-emerald-200/70' : ''"
          :data-testid="`hot-tag-${t}`"
          @click="setTagQuick(t)"
        >
          {{ t }}
        </button>
      </div>
    </div>

    <!-- 我的模板 -->
    <div v-show="mainTab === 'mine'" class="space-y-5">
      <div
        v-if="!loggedIn"
        class="flex min-h-[240px] flex-col items-center justify-center rounded-3xl border border-dashed border-stone-300/90 bg-white/60 px-8 py-12 text-center"
      >
        <p class="text-lg font-semibold text-stone-800">登录后查看你的模板</p>
        <p class="mt-2 text-sm leading-relaxed text-stone-600">创建、收藏与点赞的社区模板会显示在这里。</p>
        <div class="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-full bg-[#0a8f4a] px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#088a42]"
            data-testid="go-login"
            @click="goLogin"
          >
            <span class="material-symbols-outlined text-[20px]" aria-hidden="true">login</span>
            去登录
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-6 py-2.5 text-sm font-bold text-stone-800 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/50"
            data-testid="browse-market"
            @click="mainTab = 'market'"
          >
            <span class="material-symbols-outlined text-[20px]" aria-hidden="true">storefront</span>
            先逛模板市场
          </button>
        </div>
      </div>

      <template v-else>
        <div
          class="flex flex-wrap gap-2 rounded-3xl border border-stone-200/80 bg-white/60 p-1 ring-1 ring-white/70 shadow-sm backdrop-blur-sm"
          role="tablist"
          aria-label="我的模板范围"
        >
          <button
            v-for="s in myScopeOptions"
            :key="s"
            type="button"
            class="rounded-xl px-4 py-2 text-sm font-semibold transition duration-200"
            :class="
              myScope === s
                ? 'bg-white text-stone-900 shadow-sm ring-1 ring-emerald-200/70'
                : 'text-stone-600 hover:bg-white/70 hover:text-stone-900'
            "
            :data-testid="`my-scope-${s}`"
            @click="myScope = s"
          >
            {{ myScopeLabel[s] }}
          </button>
        </div>

        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="text-lg font-bold text-stone-900">我的社区模板</h2>
          <span class="text-sm font-medium text-stone-600">共 {{ myTotal }} 个 · {{ pageLabel }}</span>
        </div>

        <TemplateMarketList
          :items="myItems"
          :loading="loadingMy"
          :sort="marketSort"
          :logged-in="loggedIn"
          :manage-mode="myScope === 'created'"
          :show-favorite="true"
          empty-hint="还没有符合条件的模板，可切换到「我创建的」或去模板市场发现更多。"
          @update:sort="setMarketSort"
          @apply="applyMarket"
          @open-detail="(id) => openMarketDetail(id, myScope === 'created' ? 'my_created' : myScope === 'favorited' ? 'my_favorited' : 'my_liked')"
          @toggle-like="onToggleLike"
          @toggle-favorite="onToggleFavorite"
          @edit="openEdit"
          @unpublish="onUnpublish"
          @resubmit="onResubmit"
        >
          <template #empty>
            <p class="font-semibold">{{ hasFilters ? '没有符合当前筛选的模板' : '这里还没有模板' }}</p>
            <p class="mt-1 text-xs text-stone-600">
              {{ hasFilters ? '你可以清空筛选，或切换排序再试一次。' : '去模板市场发现更多社区模板。' }}
            </p>
            <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                v-if="hasFilters"
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full bg-stone-900/6 px-5 py-2 text-sm font-bold text-stone-800 ring-1 ring-white/70 transition hover:bg-stone-900/10"
                data-testid="empty-clear-filters"
                @click="clearFilters"
              >
                <span class="material-symbols-outlined text-[18px]" aria-hidden="true">filter_alt_off</span>
                清空筛选
              </button>
              <button
                v-if="marketSort !== 'new'"
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-5 py-2 text-sm font-bold text-stone-800 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/50"
                data-testid="empty-sort-new"
                @click="switchToNewSort"
              >
                切换到最新
              </button>
              <button
                v-if="marketSort !== 'likes'"
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-5 py-2 text-sm font-bold text-stone-800 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/50"
                data-testid="empty-sort-likes"
                @click="switchToLikesSort"
              >
                切换到最多赞
              </button>
              <button
                v-if="!hasFilters"
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full bg-[#0a8f4a] px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#088a42]"
                data-testid="empty-go-market"
                @click="mainTab = 'market'"
              >
                去模板市场
              </button>
            </div>
          </template>
        </TemplateMarketList>

        <UiConfirmDialog
          v-if="editingTemplate"
          :open="true"
          title="编辑模板信息"
          confirm-text="保存并重新审核"
          cancel-text="取消"
          :confirm-loading="editSubmitting"
          @confirm="submitEdit"
          @cancel="closeEdit"
        >
          <div class="space-y-3 text-left">
            <label class="block">
              <span class="text-xs font-semibold text-stone-600">标题</span>
              <input
                v-model="editForm.title"
                type="text"
                class="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-200 focus:ring-2 focus:ring-emerald-100"
                data-testid="edit-title"
              />
            </label>
            <label class="block">
              <span class="text-xs font-semibold text-stone-600">摘要</span>
              <textarea
                v-model="editForm.summary"
                rows="3"
                class="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-200 focus:ring-2 focus:ring-emerald-100"
                data-testid="edit-summary"
              />
            </label>
            <label class="block">
              <span class="text-xs font-semibold text-stone-600">分类</span>
              <select
                v-model="editForm.category"
                class="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-200 focus:ring-2 focus:ring-emerald-100"
                data-testid="edit-category"
              >
                <option v-for="c in CATEGORY_OPTIONS" :key="c" :value="c">
                  {{ categoryLabel[c] ?? c }}
                </option>
              </select>
            </label>
            <label class="block">
              <span class="text-xs font-semibold text-stone-600">标签（逗号分隔）</span>
              <input
                v-model="editForm.tags"
                type="text"
                class="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-200 focus:ring-2 focus:ring-emerald-100"
                data-testid="edit-tags"
              />
            </label>
          </div>
        </UiConfirmDialog>

        <div class="flex items-center justify-end gap-2" aria-label="分页">
          <button
            type="button"
            class="rounded-2xl border border-stone-200/80 bg-white/70 px-3 py-2 text-sm font-bold text-stone-800 ring-1 ring-white/70 transition hover:bg-white disabled:opacity-50"
            data-testid="page-prev"
            :disabled="!canPrev || loadingMy"
            @click="prevPage"
          >
            上一页
          </button>
          <span class="text-sm font-semibold text-stone-500">{{ pageLabel }}</span>
          <button
            type="button"
            class="rounded-2xl border border-stone-200/80 bg-white/70 px-3 py-2 text-sm font-bold text-stone-800 ring-1 ring-white/70 transition hover:bg-white disabled:opacity-50"
            data-testid="page-next"
            :disabled="!canNext || loadingMy"
            @click="nextPage"
          >
            下一页
          </button>
        </div>
      </template>
    </div>

    <!-- 模板市场 -->
    <div v-show="mainTab === 'market'" class="space-y-10">
      <section>
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="text-lg font-bold text-stone-900">系统预设</h2>
        </div>
        <div
          v-if="loadingPresets"
          class="flex min-h-[200px] flex-col items-center justify-center gap-2 text-stone-500"
          data-testid="preset-grid"
        >
          <span
            class="inline-block h-8 w-8 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600"
            aria-hidden="true"
          />
          <span class="text-sm font-medium">加载预设中…</span>
        </div>
        <div
          v-else-if="presets.length === 0"
          class="rounded-3xl border border-dashed border-stone-300/90 bg-white/60 px-6 py-12 text-center text-sm text-stone-600"
          data-testid="preset-grid"
        >
          暂无系统预设，请稍后再试。
        </div>
        <ul v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="preset-grid">
          <li
            v-for="p in presets"
            :key="p.id"
            class="flex flex-col overflow-hidden rounded-3xl border border-stone-200/80 bg-white/90 shadow-sm ring-1 ring-white/50 transition hover:-translate-y-0.5 hover:shadow-md"
            :data-testid="`preset-card-${p.id}`"
          >
            <button
              type="button"
              class="group/preset-hit flex w-full flex-col p-5 text-left outline-none transition hover:bg-stone-50/60 focus-visible:bg-stone-50/80 focus-visible:ring-2 focus-visible:ring-emerald-200/80 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
              :data-testid="`preset-card-hit-${p.id}`"
              :aria-label="`查看预设「${p.title}」详情`"
              @click="openPresetDetail(p.id)"
            >
              <span
                class="mb-2 inline-flex w-fit items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-900 ring-1 ring-emerald-200/70"
              >
                <span class="material-symbols-outlined text-[14px]" aria-hidden="true">verified</span>
                预设
              </span>
              <p class="line-clamp-2 text-base font-bold text-stone-900 group-hover/preset-hit:text-emerald-950">
                {{ p.title }}
              </p>
              <p class="mt-1 line-clamp-3 text-sm leading-relaxed text-stone-600">{{ p.summary }}</p>
              <div class="mt-3 flex flex-wrap gap-1.5">
                <span
                  class="inline-flex items-center gap-1 rounded-full bg-emerald-50/90 px-2 py-0.5 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-200/60"
                >
                  <span class="material-symbols-outlined text-[14px]" aria-hidden="true">label</span>
                  {{ categoryLabel[p.category] ?? p.category }}
                </span>
                <span
                  v-for="t in p.tags"
                  :key="t"
                  class="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600"
                  >{{ t }}</span
                >
              </div>
            </button>
            <div class="border-t border-stone-100 bg-stone-50/50 px-5 py-4" @click.stop>
              <button
                type="button"
                class="inline-flex w-fit items-center gap-1 rounded-full bg-[#0a8f4a] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#088a42]"
                data-testid="preset-apply"
                @click="applyPreset(p.id)"
              >
                <span class="material-symbols-outlined text-[18px]" aria-hidden="true">bolt</span>
                {{ loggedIn ? '套用预设' : '登录后套用' }}
              </button>
            </div>
          </li>
        </ul>
      </section>

      <section>
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="text-lg font-bold text-stone-900">用户模板</h2>
          <span class="text-sm font-medium text-stone-600">共 {{ marketTotal }} 个 · {{ pageLabel }}</span>
        </div>
        <TemplateMarketList
          :items="marketItems"
          :loading="loadingMarket"
          :sort="marketSort"
          :logged-in="loggedIn"
          :show-favorite="true"
          empty-hint="暂时没有用户模板，换个筛选条件或稍后再来。"
          @update:sort="setMarketSort"
          @apply="applyMarket"
          @open-detail="(id) => openMarketDetail(id, 'market_list')"
          @toggle-like="onToggleLike"
          @toggle-favorite="onToggleFavorite"
        >
          <template #empty>
            <p class="font-semibold">{{ hasFilters ? '没有符合当前筛选的模板' : '暂时没有社区模板' }}</p>
            <p class="mt-1 text-xs text-stone-600">
              {{ hasFilters ? '建议清空分类/标签，或切换排序再试一次。' : '你可以先套用系统预设，稍后再来看看社区更新。' }}
            </p>
            <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                v-if="hasFilters"
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full bg-stone-900/6 px-5 py-2 text-sm font-bold text-stone-800 ring-1 ring-white/70 transition hover:bg-stone-900/10"
                data-testid="empty-clear-filters-market"
                @click="clearFilters"
              >
                <span class="material-symbols-outlined text-[18px]" aria-hidden="true">filter_alt_off</span>
                清空筛选
              </button>
              <button
                v-if="marketSort !== 'new'"
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-5 py-2 text-sm font-bold text-stone-800 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/50"
                data-testid="empty-sort-new-market"
                @click="switchToNewSort"
              >
                切换到最新
              </button>
              <button
                v-if="marketSort !== 'likes'"
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-5 py-2 text-sm font-bold text-stone-800 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/50"
                data-testid="empty-sort-likes-market"
                @click="switchToLikesSort"
              >
                切换到最多赞
              </button>
            </div>
          </template>
        </TemplateMarketList>

        <div class="flex items-center justify-end gap-2" aria-label="分页">
          <button
            type="button"
            class="rounded-2xl border border-stone-200/80 bg-white/70 px-3 py-2 text-sm font-bold text-stone-800 ring-1 ring-white/70 transition hover:bg-white disabled:opacity-50"
            data-testid="page-prev"
            :disabled="!canPrev || loadingMarket"
            @click="prevPage"
          >
            上一页
          </button>
          <span class="text-sm font-semibold text-stone-500">{{ pageLabel }}</span>
          <button
            type="button"
            class="rounded-2xl border border-stone-200/80 bg-white/70 px-3 py-2 text-sm font-bold text-stone-800 ring-1 ring-white/70 transition hover:bg-white disabled:opacity-50"
            data-testid="page-next"
            :disabled="!canNext || loadingMarket"
            @click="nextPage"
          >
            下一页
          </button>
        </div>
      </section>
    </div>
    </div>
  </div>
</template>
