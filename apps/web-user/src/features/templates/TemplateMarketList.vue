<script setup lang="ts">
import type { MarketTemplateBrief } from '../../lib/api-client';

function statusLabel(status: string | undefined) {
  const s = (status ?? 'published').toLowerCase();
  if (s === 'pending_review') return '待审核';
  if (s === 'published') return '已发布';
  if (s === 'rejected') return '已驳回';
  if (s === 'unpublished') return '已下架';
  if (s === 'banned') return '已封禁';
  return s;
}

function statusTone(status: string | undefined) {
  const s = (status ?? 'published').toLowerCase();
  if (s === 'pending_review') return 'bg-amber-50 text-amber-950 ring-amber-200/70';
  if (s === 'published') return 'bg-emerald-50 text-emerald-950 ring-emerald-200/70';
  if (s === 'rejected') return 'bg-rose-50 text-rose-950 ring-rose-200/70';
  if (s === 'unpublished') return 'bg-stone-100 text-stone-800 ring-stone-200/70';
  if (s === 'banned') return 'bg-stone-900/10 text-stone-900 ring-stone-300/70';
  return 'bg-stone-100 text-stone-800 ring-stone-200/70';
}

/** 与「我的计划」等模块一致：分类 slug → 中文展示 */
const CATEGORY_LABEL: Record<string, string> = {
  general: '通用',
  study: '学习',
  travel: '旅游',
  work: '工作',
  exam: '考试',
  fitness: '运动',
  other: '其他',
};

function categoryLabel(slug: string) {
  const k = String(slug ?? '').trim().toLowerCase();
  return CATEGORY_LABEL[k] ?? slug;
}

withDefaults(
  defineProps<{
    items: MarketTemplateBrief[];
    loading: boolean;
    sort: 'likes' | 'new';
    loggedIn: boolean;
    /** 作者管理：展示编辑/下架等按钮（仅 created scope 使用） */
    manageMode?: boolean;
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
  openDetail: [id: string];
  toggleLike: [id: string];
  toggleFavorite: [id: string];
  edit: [id: string];
  unpublish: [id: string];
  resubmit: [id: string];
}>();
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div
        class="inline-flex rounded-2xl border border-stone-200/80 bg-white/70 p-1 ring-1 ring-white/70 shadow-sm"
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

    <div
      v-if="loading"
      class="flex min-h-[200px] flex-col items-center justify-center gap-2 text-stone-500"
      data-testid="market-loading"
    >
      <span
        class="inline-block h-8 w-8 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600"
        aria-hidden="true"
      />
      <span class="text-sm font-medium">加载模板中…</span>
    </div>

    <div
      v-else-if="items.length === 0"
      class="rounded-3xl border border-dashed border-stone-300/90 bg-white/60 px-6 py-12 text-center text-sm text-stone-600"
      data-testid="market-grid"
    >
      <span class="material-symbols-outlined mb-2 block text-4xl text-[#b8c9c0]" aria-hidden="true">layers_clear</span>
      <slot name="empty">
        {{ emptyHint }}
      </slot>
    </div>

    <ul v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="market-grid">
      <li
        v-for="item in items"
        :key="item.id"
        class="flex flex-col overflow-hidden rounded-3xl border border-stone-200/80 bg-white/90 shadow-sm ring-1 ring-white/50 transition hover:-translate-y-0.5 hover:shadow-md"
        :data-testid="`market-card-${item.id}`"
      >
        <button
          type="button"
          class="group/card-hit flex w-full flex-col p-5 text-left outline-none transition hover:bg-stone-50/60 focus-visible:bg-stone-50/80 focus-visible:ring-2 focus-visible:ring-emerald-200/80 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          :data-testid="`market-card-hit-${item.id}`"
          :aria-label="`查看模板「${item.title}」详情`"
          @click="emit('openDetail', item.id)"
        >
          <p class="line-clamp-2 text-base font-bold leading-snug text-stone-900 group-hover/card-hit:text-emerald-950">
            {{ item.title }}
          </p>
          <p class="mt-1.5 line-clamp-3 text-sm leading-relaxed text-stone-600">{{ item.summary }}</p>
          <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-500">
            <span
              class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-900 ring-1 ring-emerald-200/70"
            >
              <span class="material-symbols-outlined text-[14px]" aria-hidden="true">label</span>
              {{ categoryLabel(item.category) }}
            </span>
            <span>{{ item.authorName }}</span>
            <span class="text-stone-300">·</span>
            <span data-testid="like-count" class="inline-flex items-center gap-0.5 font-medium text-stone-600">
              <span class="material-symbols-outlined text-[14px] text-rose-500/90" aria-hidden="true">favorite</span>
              {{ item.likeCount }}
            </span>
            <template v-if="manageMode">
              <span class="text-stone-300">·</span>
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ring-1"
                :class="statusTone(item.status)"
                data-testid="template-status"
              >
                <span class="material-symbols-outlined text-[14px]" aria-hidden="true">policy</span>
                {{ statusLabel(item.status) }}
              </span>
              <span
                v-if="(item.status ?? '').toLowerCase() === 'rejected' && (item.rejectReasonCode || item.rejectNote)"
                class="inline-flex items-center gap-1 text-rose-700"
                data-testid="template-reject-hint"
                :title="`${item.rejectReasonCode ?? ''}${item.rejectNote ? `：${item.rejectNote}` : ''}`"
              >
                <span class="material-symbols-outlined text-[14px]" aria-hidden="true">info</span>
                查看原因
              </span>
            </template>
          </div>
          <p
            v-if="manageMode && (item.status ?? '').toLowerCase() === 'rejected' && (item.rejectReasonCode || item.rejectNote)"
            class="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900 ring-1 ring-rose-200/70"
            data-testid="template-reject-reason"
          >
            驳回原因：{{ item.rejectReasonCode ?? 'unknown' }}{{ item.rejectNote ? ` · ${item.rejectNote}` : '' }}
          </p>
        </button>
        <div class="flex flex-wrap gap-2 border-t border-stone-100 bg-stone-50/50 px-5 py-4" @click.stop>
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
            v-if="manageMode && loggedIn"
            type="button"
            class="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-3.5 py-2 text-sm font-semibold text-stone-800 transition hover:border-emerald-200 hover:bg-emerald-50/50"
            data-testid="btn-edit"
            @click="emit('edit', item.id)"
          >
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">edit</span>
            编辑
          </button>
          <button
            v-if="manageMode && loggedIn && (item.status ?? 'published').toLowerCase() === 'published'"
            type="button"
            class="inline-flex items-center gap-1 rounded-full border border-rose-200/80 bg-rose-50/80 px-3.5 py-2 text-sm font-semibold text-rose-950 transition hover:bg-rose-100/80"
            data-testid="btn-unpublish"
            @click="emit('unpublish', item.id)"
          >
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">visibility_off</span>
            下架
          </button>
          <button
            v-if="manageMode && loggedIn && ['rejected','unpublished'].includes((item.status ?? '').toLowerCase())"
            type="button"
            class="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50/70 px-3.5 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100/70"
            data-testid="btn-resubmit"
            @click="emit('resubmit', item.id)"
          >
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">refresh</span>
            重新提交
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
