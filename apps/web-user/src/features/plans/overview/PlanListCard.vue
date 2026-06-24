<script setup lang="ts">
import type { PlanCard } from "./plan-list-types";
import {
  coverTheme,
  deadlineRelativeText,
  dueText,
  isOverdueRelativeText,
  ringWrapStyle,
  statusClass,
  titleColorClass,
} from "./plan-list-card-utils";

defineProps<{
  plan: PlanCard;
  index: number;
  desktopMenuOpen: boolean;
}>();

const emit = defineEmits<{
  "open-action-sheet": [plan: Pick<PlanCard, "id" | "title">];
  "toggle-desktop-menu": [planId: string];
  archive: [plan: Pick<PlanCard, "id" | "title">];
  delete: [plan: Pick<PlanCard, "id" | "title">];
}>();
</script>

<template>
  <router-link
    :to="`/plans/${plan.id}`"
    data-testid="plan-card"
    class="animate-plan-card group flex flex-col overflow-hidden rounded-3xl border border-stone-200/80 bg-white/85 shadow-[0_14px_44px_-26px_rgba(10,60,38,0.22)] ring-1 ring-white/85 transition duration-300 hover:-translate-y-1 hover:border-emerald-200/60 hover:bg-white/92 hover:shadow-[0_22px_54px_-24px_rgba(16,100,60,0.2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
    :style="{ '--stagger': `${index * 45}ms` }"
  >
    <div
      class="plan-cover relative overflow-hidden"
      :class="coverTheme(plan.status)"
    >
      <div class="plan-cover-grain" aria-hidden="true" />
      <div class="plan-cover-soft" aria-hidden="true" />

      <div class="absolute right-3 top-3 z-[2]">
        <button
          type="button"
          class="hidden h-9 w-9 items-center justify-center rounded-xl bg-white/55 text-stone-700 ring-1 ring-white/70 backdrop-blur-sm transition hover:bg-white/75 hover:text-stone-900 sm:inline-flex"
          :data-testid="`plan-more-${plan.id}`"
          aria-label="更多操作"
          @click.stop.prevent="emit('toggle-desktop-menu', plan.id)"
        >
          <span class="text-lg leading-none">⋯</span>
        </button>
        <button
          type="button"
          class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/55 text-stone-700 ring-1 ring-white/70 backdrop-blur-sm transition hover:bg-white/75 hover:text-stone-900 sm:hidden"
          :data-testid="`plan-more-mobile-${plan.id}`"
          aria-label="更多操作"
          @click.stop.prevent="emit('open-action-sheet', plan)"
        >
          <span class="text-lg leading-none">⋯</span>
        </button>

        <div
          v-if="desktopMenuOpen"
          class="absolute right-0 mt-2 w-44 overflow-hidden rounded-2xl border border-stone-200/80 bg-white/95 shadow-[0_18px_48px_-30px_rgba(10,60,38,0.35)] ring-1 ring-white/80 backdrop-blur"
          :data-testid="`plan-menu-${plan.id}`"
          @click.stop
        >
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-extrabold text-slate-700 transition hover:bg-slate-50"
            :data-testid="`plan-archive-${plan.id}`"
            @click.stop.prevent="emit('archive', plan)"
          >
            <span>归档计划</span>
            <span class="text-xs font-semibold text-slate-500/80">只读</span>
          </button>
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-extrabold text-rose-700 transition hover:bg-rose-50"
            :data-testid="`plan-delete-${plan.id}`"
            @click.stop.prevent="emit('delete', plan)"
          >
            <span>删除计划</span>
            <span class="text-xs font-semibold text-rose-700/60">可恢复</span>
          </button>
        </div>
      </div>

      <div class="plan-cover-inner flex items-center gap-4 px-5 py-4">
        <div class="plan-ring-wrap shrink-0" :style="ringWrapStyle(plan)">
          <div class="plan-ring" aria-hidden="true" />
          <div class="plan-ring-text" aria-hidden="true">
            <span class="plan-ring-num tabular-nums">{{ plan.progress }}%</span>
          </div>
        </div>

        <div class="min-w-0 flex-1">
          <p class="plan-cover-time text-[12px] font-semibold text-stone-900/80">
            {{ dueText(plan.deadline) }}
            <span v-if="deadlineRelativeText(plan)" class="text-stone-900/35"
              >·</span
            >
            <span
              class="plan-cover-rel"
              :class="
                isOverdueRelativeText(deadlineRelativeText(plan))
                  ? 'plan-cover-rel--overdue'
                  : ''
              "
              >{{ deadlineRelativeText(plan) }}</span
            >
          </p>
          <div class="mt-2 flex items-center gap-2">
            <span class="plan-status-pill" :class="statusClass(plan.status)">
              {{ plan.status }}
            </span>
          </div>
          <p
            v-if="plan.coverLine"
            class="mt-2 line-clamp-1 text-[12px] font-medium text-stone-900/65"
          >
            {{ plan.coverLine }}
          </p>
        </div>
      </div>
    </div>

    <div class="flex flex-1 flex-col p-5">
      <h2
        class="mb-2 line-clamp-2 text-lg font-bold leading-snug tracking-tight sm:text-xl"
        :class="titleColorClass(plan)"
      >
        {{ plan.title }}
      </h2>
      <p class="mb-5 line-clamp-3 text-[14px] leading-relaxed text-stone-600">
        {{ plan.description }}
      </p>
      <div class="mt-auto">
        <div
          class="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-stone-500"
        >
          <span class="inline-flex items-center gap-1.5">
            <span>{{ dueText(plan.deadline) }}</span>
          </span>
          <span
            v-if="deadlineRelativeText(plan)"
            class="tabular-nums"
            :class="
              isOverdueRelativeText(deadlineRelativeText(plan))
                ? 'text-rose-700'
                : 'text-stone-600'
            "
          >
            {{ deadlineRelativeText(plan) }}
          </span>
        </div>
      </div>
    </div>
  </router-link>
</template>

<style scoped>
@keyframes plan-card-in {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-plan-card {
  animation: plan-card-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: var(--stagger, 0ms);
}

@media (prefers-reduced-motion: reduce) {
  .animate-plan-card {
    animation: none;
  }
}

.plan-cover {
  min-height: 150px;
  border-bottom: 1px solid rgba(231, 236, 233, 0.85);
}

.plan-cover-inner {
  position: relative;
  z-index: 1;
}

.plan-cover-grain {
  position: absolute;
  inset: 0;
  opacity: 0.06;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  pointer-events: none;
}

.plan-cover-soft {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(
      ellipse 520px 220px at 18% 10%,
      rgba(255, 255, 255, 0.75),
      transparent 55%
    ),
    radial-gradient(
      ellipse 520px 240px at 86% 92%,
      rgba(255, 255, 255, 0.65),
      transparent 55%
    );
  opacity: 0.75;
}

.cover--active {
  background:
    radial-gradient(
      ellipse 520px 240px at 12% 0%,
      rgba(16, 185, 129, 0.22),
      transparent 58%
    ),
    radial-gradient(
      ellipse 520px 260px at 92% 100%,
      rgba(253, 230, 138, 0.14),
      transparent 55%
    ),
    linear-gradient(
      165deg,
      rgba(255, 255, 255, 0.92) 0%,
      rgba(240, 252, 246, 0.92) 100%
    );
}

.cover--idle {
  background:
    radial-gradient(
      ellipse 520px 240px at 12% 0%,
      rgba(148, 163, 156, 0.18),
      transparent 58%
    ),
    radial-gradient(
      ellipse 520px 260px at 92% 100%,
      rgba(226, 232, 228, 0.32),
      transparent 55%
    ),
    linear-gradient(
      165deg,
      rgba(255, 255, 255, 0.92) 0%,
      rgba(248, 250, 249, 0.92) 100%
    );
}

.cover--done {
  background:
    radial-gradient(
      ellipse 520px 240px at 12% 0%,
      rgba(20, 184, 166, 0.18),
      transparent 58%
    ),
    radial-gradient(
      ellipse 520px 260px at 92% 100%,
      rgba(16, 185, 129, 0.1),
      transparent 55%
    ),
    linear-gradient(
      165deg,
      rgba(255, 255, 255, 0.92) 0%,
      rgba(238, 252, 249, 0.92) 100%
    );
}

.plan-ring-wrap {
  position: relative;
  width: 52px;
  height: 52px;
}

.plan-ring {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background:
    var(
      --ring-segments,
      conic-gradient(
        from 210deg,
        var(--ring-main, rgba(16, 185, 129, 0.95)) calc(var(--p, 0) * 1%),
        var(--ring-muted, rgba(16, 185, 129, 0.14)) 0
      )
    ),
    radial-gradient(
      circle at 35% 35%,
      rgba(255, 255, 255, 0.85),
      rgba(255, 255, 255, 0.55) 55%,
      transparent 60%
    );
  box-shadow:
    0 10px 24px -14px rgba(10, 143, 74, 0.38),
    0 0 0 1px rgba(16, 185, 129, 0.18) inset;
  -webkit-mask: radial-gradient(circle, transparent 62%, #000 64%);
  mask: radial-gradient(circle, transparent 62%, #000 64%);
}

.plan-ring-text {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.8) inset;
}

.plan-ring-num {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: rgba(15, 31, 22, 0.92);
}

.plan-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.32rem 0.55rem;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  backdrop-filter: blur(8px);
}

.plan-cover-rel {
  font-weight: 700;
  color: rgba(15, 31, 22, 0.72);
}

.plan-cover-rel--overdue {
  color: rgba(180, 83, 9, 0.92);
}

@media (prefers-reduced-motion: no-preference) {
  .plan-cover {
    transition:
      filter 0.35s ease,
      transform 0.35s ease;
  }

  [data-testid="plan-card"]:hover .plan-cover-soft {
    opacity: 0.9;
  }

  [data-testid="plan-card"]:hover .plan-ring {
    filter: brightness(1.04) saturate(1.05);
  }
}
</style>
