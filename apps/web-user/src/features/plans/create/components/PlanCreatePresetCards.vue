<script setup lang="ts">
import type { PlanCreateContext } from "../composables/plan-create-context";

const props = defineProps<{ ctx: PlanCreateContext }>();
const {
  showEmbeddedPresets,
  embeddedPresetsLoading,
  embeddedPresetBriefs,
  applyingEmbeddedPresetId,
  applyEmbeddedPreset,
} = props.ctx;
</script>

<template>
            <section
              v-if="showEmbeddedPresets && (embeddedPresetsLoading || embeddedPresetBriefs.length > 0)"
              class="rounded-2xl border border-[#dbe8e1] bg-[#f6faf8] p-4 sm:p-5"
              data-testid="create-preset-strip"
            >
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <h3 class="text-sm font-bold text-[#1f2a24]">官方示例</h3>
                <span class="text-xs text-[#64716b]">点按即可预填下方表单，仍可自由修改</span>
              </div>
              <p
                v-if="embeddedPresetsLoading"
                class="mt-3 text-xs font-medium text-[#64716b]"
                data-testid="create-preset-loading"
              >
                加载示例中…
              </p>
              <div v-else class="mt-3 flex flex-wrap gap-2">
                <button
                  v-for="p in embeddedPresetBriefs"
                  :key="p.id"
                  type="button"
                  class="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-[#d0ddd6] bg-white px-3 py-2 text-left text-xs font-semibold text-[#1f2a24] shadow-sm transition hover:border-[#0f8b4e]/40 hover:bg-emerald-50/50 disabled:opacity-60"
                  :data-testid="`create-preset-${p.id}`"
                  :disabled="applyingEmbeddedPresetId === p.id"
                  @click="applyEmbeddedPreset(p.id)"
                >
                  <span
                    class="material-symbols-outlined shrink-0 text-[16px] text-[#0a8f4a]"
                    aria-hidden="true"
                    >bolt</span
                  >
                  <span class="line-clamp-1">{{ p.title }}</span>
                </button>
              </div>
            </section>
</template>
