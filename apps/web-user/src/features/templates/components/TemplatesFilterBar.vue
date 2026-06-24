<script setup lang="ts">
const searchQ = defineModel<string>('searchQ', { required: true });
const filterCategory = defineModel<string>('filterCategory', { required: true });
const filterTag = defineModel<string>('filterTag', { required: true });

defineProps<{
  hasFilters: boolean;
  categoryOptions: readonly string[];
  categoryLabel: Record<string, string>;
  hotTags: readonly string[];
}>();

const emit = defineEmits<{
  'clear-filters': [];
  'set-tag': [tag: string];
}>();
</script>

<template>
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
        <option v-for="c in categoryOptions" :key="c" :value="c">
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
          <option v-for="t in hotTags" :key="t" :value="t" />
        </datalist>
      </label>

      <button
        v-if="hasFilters"
        type="button"
        class="inline-flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-stone-200/80 bg-white/70 px-3 text-sm font-semibold text-stone-800 ring-1 ring-white/70 transition hover:bg-white sm:ml-auto"
        data-testid="template-clear-filters"
        @click="emit('clear-filters')"
      >
        <span class="material-symbols-outlined text-[18px]" aria-hidden="true">filter_alt_off</span>
        清空筛选
      </button>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-200/60 pt-3">
      <span class="text-xs font-semibold text-stone-500">热门标签</span>
      <button
        v-for="t in hotTags"
        :key="t"
        type="button"
        class="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700 ring-1 ring-stone-200/70 transition hover:bg-emerald-50 hover:text-emerald-900"
        :class="filterTag.trim() === t ? 'bg-emerald-50 text-emerald-900 ring-emerald-200/70' : ''"
        :data-testid="`hot-tag-${t}`"
        @click="emit('set-tag', t)"
      >
        {{ t }}
      </button>
    </div>
  </div>
</template>
