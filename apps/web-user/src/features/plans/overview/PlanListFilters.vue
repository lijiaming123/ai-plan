<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import type { FilterType } from "./plan-list-types";
import { PLAN_FILTERS } from "./plan-list-types";

const props = defineProps<{
  activeFilter: FilterType;
  trashCount: number | null;
}>();

const emit = defineEmits<{
  "update:activeFilter": [filter: FilterType];
}>();

const filters = PLAN_FILTERS;

const filterRailRef = ref<HTMLElement | null>(null);
const filterIndicatorStyle = ref<Record<string, string>>({
  left: "0px",
  top: "0px",
  width: "0px",
  height: "0px",
  opacity: "0",
});

function updateFilterIndicator() {
  const rail = filterRailRef.value;
  if (!rail) return;
  const idx = filters.indexOf(props.activeFilter);
  const btn = rail.querySelector(
    `[data-plan-tab-index="${idx}"]`,
  ) as HTMLElement | null;
  if (!btn) return;
  const rl = rail.getBoundingClientRect();
  const br = btn.getBoundingClientRect();
  filterIndicatorStyle.value = {
    left: `${br.left - rl.left}px`,
    top: `${br.top - rl.top}px`,
    width: `${br.width}px`,
    height: `${br.height}px`,
    opacity: "1",
  };
}

function scheduleFilterIndicatorUpdate() {
  void nextTick(() => {
    requestAnimationFrame(() => updateFilterIndicator());
  });
}

let filterResizeObserver: ResizeObserver | null = null;

function setFilter(filter: FilterType) {
  emit("update:activeFilter", filter);
}

onMounted(() => {
  window.addEventListener("resize", scheduleFilterIndicatorUpdate);
});

onUnmounted(() => {
  window.removeEventListener("resize", scheduleFilterIndicatorUpdate);
  filterResizeObserver?.disconnect();
  filterResizeObserver = null;
});

watch(() => props.activeFilter, scheduleFilterIndicatorUpdate);

watch(
  filterRailRef,
  (el) => {
    filterResizeObserver?.disconnect();
    filterResizeObserver = null;
    if (el && typeof ResizeObserver !== "undefined") {
      filterResizeObserver = new ResizeObserver(scheduleFilterIndicatorUpdate);
      filterResizeObserver.observe(el);
    }
    scheduleFilterIndicatorUpdate();
  },
  { immediate: true },
);
</script>

<template>
  <div class="mt-6 flex flex-wrap items-center justify-between gap-3">
    <div
      class="plan-filter-rail-scroll -mx-1 max-w-full overflow-x-auto overflow-y-visible px-1 pb-0.5 sm:mx-0 sm:overflow-visible sm:px-0"
    >
      <div
        ref="filterRailRef"
        class="plan-filter-rail relative inline-flex min-w-min flex-nowrap gap-1 rounded-2xl border border-white/60 bg-white/50 p-1.5 shadow-[0_1px_0_rgba(255,255,255,0.85)_inset,0_8px_24px_-12px_rgba(15,60,40,0.12)] backdrop-blur-sm"
        role="tablist"
        aria-label="计划筛选"
      >
        <span
          class="plan-filter-indicator pointer-events-none absolute z-0 overflow-hidden rounded-xl bg-white shadow-[0_3px_14px_-4px_rgba(12,72,48,0.22),0_0_0_1px_rgba(16,185,129,0.2)] ring-1 ring-emerald-200/55"
          aria-hidden="true"
          :style="filterIndicatorStyle"
        >
          <span
            :key="activeFilter"
            class="plan-filter-indicator-shine"
            aria-hidden="true"
          />
        </span>
        <button
          v-for="(filter, tabIndex) in filters"
          :key="filter"
          type="button"
          :data-testid="`filter-${filter}`"
          :data-plan-tab-index="tabIndex"
          class="relative z-[1] whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-semibold transition-[color,background-color] duration-200 ease-out"
          :class="
            activeFilter === filter
              ? 'text-stone-900'
              : 'text-stone-600 hover:bg-white/55 hover:text-stone-900'
          "
          :aria-selected="activeFilter === filter"
          role="tab"
          @click="setFilter(filter)"
        >
          {{ filter }}
        </button>
      </div>
    </div>
    <router-link
      to="/plans/trash"
      class="inline-flex items-center gap-2 rounded-2xl bg-white/40 px-2.5 py-2 text-sm font-semibold text-stone-600 ring-1 ring-white/60 backdrop-blur-sm transition hover:bg-white/65 hover:text-stone-900"
      data-testid="link-plan-trash"
      @click.stop
    >
      <span class="material-symbols-outlined text-[18px]" aria-hidden="true"
        >restore_from_trash</span
      >
      <span>最近删除</span>
      <span
        v-if="trashCount != null && trashCount > 0"
        class="rounded-full bg-stone-900/8 px-2 py-0.5 text-xs font-extrabold tabular-nums text-stone-700 ring-1 ring-white/70"
        data-testid="trash-count"
      >
        {{ trashCount }}
      </span>
    </router-link>
  </div>
</template>

<style scoped>
.plan-filter-rail-scroll {
  -webkit-overflow-scrolling: touch;
}

@media (prefers-reduced-motion: no-preference) {
  .plan-filter-rail {
    position: relative;
  }

  .plan-filter-rail::before {
    content: "";
    position: absolute;
    inset: -35% -45%;
    background: radial-gradient(
      circle at 35% 45%,
      rgba(52, 211, 153, 0.12),
      transparent 58%
    );
    pointer-events: none;
    opacity: 0.85;
    animation: plan-filter-rail-glow 7s ease-in-out infinite;
  }
}

@keyframes plan-filter-rail-glow {
  0%,
  100% {
    transform: translateX(-4%) scale(1);
    opacity: 0.65;
  }
  50% {
    transform: translateX(5%) scale(1.03);
    opacity: 0.95;
  }
}

.plan-filter-indicator {
  transition:
    left 0.48s cubic-bezier(0.34, 1.22, 0.64, 1),
    top 0.48s cubic-bezier(0.34, 1.22, 0.64, 1),
    width 0.42s cubic-bezier(0.34, 1.15, 0.64, 1),
    height 0.42s cubic-bezier(0.34, 1.15, 0.64, 1),
    opacity 0.18s ease,
    box-shadow 0.35s ease;
  will-change: left, top, width, height;
}

.plan-filter-indicator-shine {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(
    105deg,
    transparent 0%,
    transparent 38%,
    rgba(255, 255, 255, 0.65) 48%,
    rgba(255, 255, 255, 0.2) 52%,
    transparent 62%
  );
  animation: plan-filter-shine-sweep 0.58s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@media (prefers-reduced-motion: reduce) {
  .plan-filter-rail::before {
    display: none;
  }

  .plan-filter-indicator {
    transition:
      left 0.2s ease,
      top 0.2s ease,
      width 0.2s ease,
      height 0.2s ease,
      opacity 0.15s ease;
    will-change: auto;
  }

  .plan-filter-indicator-shine {
    display: none;
  }
}

@keyframes plan-filter-shine-sweep {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(100%);
  }
}
</style>
