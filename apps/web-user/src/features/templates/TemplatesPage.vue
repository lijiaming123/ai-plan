<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { MarketTemplateBrief, PresetTemplateBrief } from '../../lib/api-client';
import { getApiClient } from '../../lib/api-client';
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

const loggedIn = computed(() => Boolean(authState.token));

async function loadPresets() {
  loadingPresets.value = true;
  try {
    const res = await client.listPresets(
      filterCategory.value.trim() ? { category: filterCategory.value.trim() } : undefined,
    );
    presets.value = res.items;
  } catch (e) {
    errorToastMessage.value = e instanceof Error ? e.message : '加载预设模板失败';
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
      pageSize: 20,
      token: authState.token || undefined,
    });
    marketItems.value = res.items;
    marketTotal.value = res.total;
  } catch (e) {
    errorToastMessage.value = e instanceof Error ? e.message : '加载用户模板失败';
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
      pageSize: 20,
    });
    myItems.value = res.items;
    myTotal.value = res.total;
  } catch (e) {
    errorToastMessage.value = e instanceof Error ? e.message : '加载我的模板失败';
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
    await router.push(`/plans/${planId}`);
  } catch (e) {
    errorToastMessage.value = e instanceof Error ? e.message : '套用失败';
  }
}

async function applyMarket(id: string) {
  if (!loggedIn.value) {
    goLogin();
    return;
  }
  try {
    const { planId } = await client.applyMarketTemplate({ id, token: authState.token });
    await router.push(`/plans/${planId}`);
  } catch (e) {
    errorToastMessage.value = e instanceof Error ? e.message : '套用失败';
  }
}

function setMarketSort(value: 'likes' | 'new') {
  marketSort.value = value;
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
    errorToastMessage.value = e instanceof Error ? e.message : '操作失败';
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
    errorToastMessage.value = e instanceof Error ? e.message : '收藏失败';
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
  <div class="ui-scrollbar font-plan h-full overflow-y-auto pr-1 text-stone-800">
    <UiErrorToast :message="errorToastMessage" @close="errorToastMessage = ''" />

    <div
      v-if="publishBanner"
      class="mb-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/95 px-4 py-3 text-sm font-medium text-emerald-950"
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

    <header class="mb-4 flex flex-col gap-4 sm:mb-5 lg:flex-row lg:items-start lg:justify-between">
      <div class="min-w-0">
        <h1 class="text-[46px] font-black leading-none tracking-[-0.03em] text-stone-900">模板</h1>
        <p class="mt-2 max-w-xl text-sm leading-snug text-[#5d6a64]">
          套用系统预设或社区模板；在「我的模板」查看已发布、收藏与点赞。
        </p>
      </div>
      <div
        class="flex w-full shrink-0 rounded-2xl border border-stone-200/80 bg-stone-50/90 p-1 shadow-sm sm:w-auto"
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

    <div
      class="mb-6 flex flex-col gap-2 rounded-2xl border border-[#e6ebe8] bg-white p-2 shadow-sm sm:flex-row sm:flex-wrap sm:items-center"
    >
      <label class="group relative min-w-0 flex-1">
        <span
          class="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#a8b5ae] group-focus-within:text-[#0a8f4a]"
          aria-hidden="true"
          >search</span
        >
        <input
          v-model="searchQ"
          type="search"
          placeholder="搜索标题或摘要…"
          class="w-full rounded-xl border border-transparent bg-stone-50/80 py-2 pl-10 pr-3 text-sm text-stone-900 outline-none transition placeholder:text-[#9ca8a3] focus:border-emerald-200 focus:bg-white focus:ring-2 focus:ring-emerald-100"
          data-testid="template-search"
        />
      </label>
      <input
        v-model="filterCategory"
        type="text"
        placeholder="分类"
        class="w-full rounded-xl border border-transparent bg-stone-50/80 px-3 py-2 text-sm outline-none focus:border-emerald-200 focus:bg-white focus:ring-2 focus:ring-emerald-100 sm:w-36"
        data-testid="template-category"
      />
      <input
        v-model="filterTag"
        type="text"
        placeholder="标签"
        class="w-full rounded-xl border border-transparent bg-stone-50/80 px-3 py-2 text-sm outline-none focus:border-emerald-200 focus:bg-white focus:ring-2 focus:ring-emerald-100 sm:w-28"
        data-testid="template-tag"
      />
    </div>

    <!-- 我的模板 -->
    <div v-show="mainTab === 'mine'" class="space-y-5">
      <div
        v-if="!loggedIn"
        class="rounded-2xl border border-dashed border-[#d0d8d3] bg-white/80 px-6 py-12 text-center"
      >
        <p class="text-lg font-bold text-stone-900">登录后查看你的模板</p>
        <p class="mt-1 text-sm text-[#7c8a84]">创建、收藏与点赞的社区模板会显示在这里。</p>
        <button
          type="button"
          class="mt-5 inline-flex items-center gap-1.5 rounded-full bg-[#0a8f4a] px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#088a42]"
          @click="goLogin"
        >
          <span class="material-symbols-outlined text-[20px]" aria-hidden="true">login</span>
          去登录
        </button>
      </div>

      <template v-else>
        <div
          class="flex flex-wrap gap-2 rounded-2xl border border-stone-200/80 bg-stone-50/80 p-1.5 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset]"
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
          <span class="text-sm text-[#7c8a84]">共 {{ myTotal }} 个</span>
        </div>

        <TemplateMarketList
          :items="myItems"
          :loading="loadingMy"
          :sort="marketSort"
          :logged-in="loggedIn"
          :show-favorite="true"
          empty-hint="还没有符合条件的模板，可切换到「我创建的」或去模板市场发现更多。"
          @update:sort="setMarketSort"
          @apply="applyMarket"
          @toggle-like="onToggleLike"
          @toggle-favorite="onToggleFavorite"
        />
      </template>
    </div>

    <!-- 模板市场 -->
    <div v-show="mainTab === 'market'" class="space-y-10">
      <section>
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="text-lg font-bold text-stone-900">系统预设</h2>
        </div>
        <p v-if="loadingPresets" class="flex items-center gap-2 text-sm text-[#5d6a64]">
          <span class="material-symbols-outlined animate-pulse text-[#0a8f4a]" aria-hidden="true">hourglass_top</span>
          加载中…
        </p>
        <div
          v-else-if="presets.length === 0"
          class="rounded-2xl border border-dashed border-[#d0d8d3] bg-white/80 px-6 py-12 text-center text-sm text-[#7c8a84]"
          data-testid="preset-grid"
        >
          暂无系统预设，请稍后再试。
        </div>
        <ul v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="preset-grid">
          <li
            v-for="p in presets"
            :key="p.id"
            class="flex flex-col rounded-2xl border border-[#e6ebe8] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <span
              class="mb-2 inline-flex w-fit items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-900 ring-1 ring-emerald-200/70"
            >
              <span class="material-symbols-outlined text-[14px]" aria-hidden="true">verified</span>
              预设
            </span>
            <p class="text-base font-bold text-stone-900">{{ p.title }}</p>
            <p class="mt-1 line-clamp-3 text-sm leading-relaxed text-[#5d6a64]">{{ p.summary }}</p>
            <div class="mt-3 flex flex-wrap gap-1.5">
              <span
                v-for="t in p.tags"
                :key="t"
                class="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600"
                >{{ t }}</span
              >
            </div>
            <button
              type="button"
              class="mt-4 inline-flex w-fit items-center gap-1 rounded-full bg-[#0a8f4a] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#088a42]"
              data-testid="preset-apply"
              @click="applyPreset(p.id)"
            >
              <span class="material-symbols-outlined text-[18px]" aria-hidden="true">bolt</span>
              {{ loggedIn ? '套用预设' : '登录后套用' }}
            </button>
          </li>
        </ul>
      </section>

      <section>
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="text-lg font-bold text-stone-900">用户模板</h2>
          <span class="text-sm text-[#7c8a84]">共 {{ marketTotal }} 个</span>
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
          @toggle-like="onToggleLike"
          @toggle-favorite="onToggleFavorite"
        />
      </section>
    </div>
  </div>
</template>
