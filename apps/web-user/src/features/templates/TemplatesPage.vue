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
import TemplatesFilterBar from './components/TemplatesFilterBar.vue';
import TemplatesEditDialog from './components/TemplatesEditDialog.vue';
import TemplatesPresetGrid from './components/TemplatesPresetGrid.vue';
import TemplatesPagination from './components/TemplatesPagination.vue';

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
    <TemplatesFilterBar
      v-model:search-q="searchQ"
      v-model:filter-category="filterCategory"
      v-model:filter-tag="filterTag"
      :has-filters="hasFilters"
      :category-options="CATEGORY_OPTIONS"
      :category-label="categoryLabel"
      :hot-tags="HOT_TAGS"
      @clear-filters="clearFilters"
      @set-tag="setTagQuick"
    />

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

        <TemplatesEditDialog
          :open="Boolean(editingTemplate)"
          v-model:title="editForm.title"
          v-model:summary="editForm.summary"
          v-model:category="editForm.category"
          v-model:tags="editForm.tags"
          :submitting="editSubmitting"
          :category-options="CATEGORY_OPTIONS"
          :category-label="categoryLabel"
          @submit="submitEdit"
          @cancel="closeEdit"
        />

        <TemplatesPagination
          :page-label="pageLabel"
          :can-prev="canPrev"
          :can-next="canNext"
          :loading="loadingMy"
          @prev="prevPage"
          @next="nextPage"
        />
      </template>
    </div>

    <!-- 模板市场 -->
    <div v-show="mainTab === 'market'" class="space-y-10">
      <TemplatesPresetGrid
        :presets="presets"
        :loading="loadingPresets"
        :logged-in="loggedIn"
        :category-label="categoryLabel"
        @apply="applyPreset"
        @open-detail="openPresetDetail"
      />

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

        <TemplatesPagination
          :page-label="pageLabel"
          :can-prev="canPrev"
          :can-next="canNext"
          :loading="loadingMarket"
          @prev="prevPage"
          @next="nextPage"
        />
      </section>
    </div>
    </div>
  </div>
</template>
