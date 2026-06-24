<script setup lang="ts">
import type { PresetTemplateBrief } from '../../../lib/api-client';

defineProps<{
  presets: PresetTemplateBrief[];
  loading: boolean;
  loggedIn: boolean;
  categoryLabel: Record<string, string>;
}>();

const emit = defineEmits<{
  apply: [id: string];
  'open-detail': [id: string];
}>();
</script>

<template>
  <section>
    <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 class="text-lg font-bold text-stone-900">系统预设</h2>
    </div>
    <div
      v-if="loading"
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
          @click="emit('open-detail', p.id)"
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
            @click="emit('apply', p.id)"
          >
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">bolt</span>
            {{ loggedIn ? '套用预设' : '登录后套用' }}
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
