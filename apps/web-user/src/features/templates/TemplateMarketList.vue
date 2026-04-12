<script setup lang="ts">
import type { MarketTemplateBrief } from '../../lib/api-client';

withDefaults(
  defineProps<{
    items: MarketTemplateBrief[];
    loading: boolean;
    sort: 'likes' | 'new';
    loggedIn: boolean;
    /** 是否显示收藏按钮（模板市场等） */
    showFavorite?: boolean;
    /** 空列表时的说明文案 */
    emptyHint?: string;
  }>(),
  {
    emptyHint: '暂时没有符合条件的模板，试试调整筛选或去模板市场逛逛。',
  },
);

const emit = defineEmits<{
  'update:sort': [value: 'likes' | 'new'];
  apply: [id: string];
  toggleLike: [id: string];
  toggleFavorite: [id: string];
}>();
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div
        class="inline-flex rounded-2xl border border-stone-200/80 bg-stone-50/80 p-1 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset]"
        role="group"
        aria-label="排序"
      >
        <button
          type="button"
          data-testid="sort-new"
          class="flex items-center gap-1 rounded-xl px-3.5 py-2 text-sm font-semibold transition duration-200"
          :class="
            sort === 'new'
              ? 'bg-white text-stone-900 shadow-sm ring-1 ring-emerald-200/70'
              : 'text-stone-600 hover:bg-white/80 hover:text-stone-900'
          "
          @click="emit('update:sort', 'new')"
        >
          <span class="material-symbols-outlined text-[18px] text-[#0a8f4a]" aria-hidden="true">schedule</span>
          最新
        </button>
        <button
          type="button"
          data-testid="sort-likes"
          class="flex items-center gap-1 rounded-xl px-3.5 py-2 text-sm font-semibold transition duration-200"
          :class="
            sort === 'likes'
              ? 'bg-white text-stone-900 shadow-sm ring-1 ring-emerald-200/70'
              : 'text-stone-600 hover:bg-white/80 hover:text-stone-900'
          "
          @click="emit('update:sort', 'likes')"
        >
          <span class="material-symbols-outlined text-[18px] text-[#0a8f4a]" aria-hidden="true">favorite</span>
          最多赞
        </button>
      </div>
    </div>

    <p v-if="loading" class="flex items-center gap-2 text-sm text-[#5d6a64]" data-testid="market-loading">
      <span class="material-symbols-outlined animate-pulse text-[#0a8f4a]" aria-hidden="true">hourglass_top</span>
      加载中…
    </p>

    <div
      v-else-if="items.length === 0"
      class="rounded-2xl border border-dashed border-[#d0d8d3] bg-white/90 px-6 py-12 text-center text-sm text-[#7c8a84]"
      data-testid="market-grid"
    >
      <span class="material-symbols-outlined mb-2 block text-4xl text-[#b8c9c0]" aria-hidden="true">layers_clear</span>
      {{ emptyHint }}
    </div>

    <ul v-else class="grid gap-4 sm:grid-cols-2" data-testid="market-grid">
      <li
        v-for="item in items"
        :key="item.id"
        class="flex flex-col rounded-2xl border border-[#e6ebe8] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        :data-testid="`market-card-${item.id}`"
      >
        <p class="text-base font-bold leading-snug text-stone-900">{{ item.title }}</p>
        <p class="mt-1.5 line-clamp-2 text-sm leading-relaxed text-[#5d6a64]">{{ item.summary }}</p>
        <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#7c8a84]">
          <span
            class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-900 ring-1 ring-emerald-200/70"
          >
            <span class="material-symbols-outlined text-[14px]" aria-hidden="true">label</span>
            {{ item.category }}
          </span>
          <span>{{ item.authorName }}</span>
          <span class="text-[#c5d0c9]">·</span>
          <span data-testid="like-count" class="inline-flex items-center gap-0.5 font-medium text-stone-600">
            <span class="material-symbols-outlined text-[14px] text-rose-500/90" aria-hidden="true">favorite</span>
            {{ item.likeCount }}
          </span>
        </div>
        <div class="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-4">
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-full bg-[#0a8f4a] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#088a42]"
            data-testid="btn-apply"
            @click="emit('apply', item.id)"
          >
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">bolt</span>
            {{ loggedIn ? '套用' : '登录后套用' }}
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-3.5 py-2 text-sm font-semibold text-stone-800 transition hover:border-emerald-200 hover:bg-emerald-50/50"
            data-testid="btn-like"
            @click="emit('toggleLike', item.id)"
          >
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">{{
              item.likedByMe ? 'heart_minus' : 'favorite'
            }}</span>
            <template v-if="!loggedIn">登录后点赞</template>
            <template v-else-if="item.likedByMe">取消赞</template>
            <template v-else>点赞</template>
          </button>
          <button
            v-if="showFavorite !== false && loggedIn"
            type="button"
            class="inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50/80 px-3.5 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-100/80"
            data-testid="btn-favorite"
            @click="emit('toggleFavorite', item.id)"
          >
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">{{
              item.favorited ? 'bookmark' : 'bookmark_add'
            }}</span>
            {{ item.favorited ? '已收藏' : '收藏' }}
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
