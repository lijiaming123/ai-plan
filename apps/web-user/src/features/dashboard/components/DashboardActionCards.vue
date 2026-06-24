<script setup lang="ts">
import type { PlanListRow } from "../../../lib/api-client";
import { computed } from "vue";

const props = defineProps<{
  plans: PlanListRow[];
}>();

export type ActionSummaryCard = {
  id: string;
  label: string;
  value: number;
  hint: string;
  icon: string;
  tone: "emerald" | "rose" | "amber";
  to: string;
};

function deadlineDayFromIso(iso: string): string {
  const d = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : iso;
}

function planDeadlineState(p: PlanListRow): "overdue" | "dueSoon" | "later" {
  if (p.completed) return "later";
  const day = deadlineDayFromIso(p.deadline);
  const start = new Date(`${day}T00:00:00`);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysLeft = Math.ceil(
    (start.getTime() - todayStart.getTime()) / 86400000,
  );
  if (daysLeft < 0) return "overdue";
  if (daysLeft <= 7) return "dueSoon";
  return "later";
}

const actionSummaryCards = computed((): ActionSummaryCard[] => {
  const plans = props.plans;
  const todayPendingPlans = plans.filter((p) => p.todayMissing);
  const overduePlans = plans.filter((p) => planDeadlineState(p) === "overdue");
  const dueSoonPlans = plans.filter((p) => planDeadlineState(p) === "dueSoon");
  const targetFor = (matches: PlanListRow[]) =>
    matches[0]?.id ? `/plans/${matches[0].id}` : "/plans?status=in_progress";
  return [
    {
      id: "today",
      label: "今日待处理",
      value: todayPendingPlans.length,
      hint:
        todayPendingPlans.length > 0
          ? "优先处理今天应打卡但还未完成的计划"
          : "今天暂无待处理打卡",
      icon: "today",
      tone: "emerald",
      to: targetFor(todayPendingPlans),
    },
    {
      id: "overdue",
      label: "已逾期",
      value: overduePlans.length,
      hint:
        overduePlans.length > 0
          ? "建议先复盘或调整这些计划的截止安排"
          : "没有超过截止日的未完成计划",
      icon: "warning",
      tone: "rose",
      to: targetFor(overduePlans),
    },
    {
      id: "due-soon",
      label: "即将截止",
      value: dueSoonPlans.length,
      hint:
        dueSoonPlans.length > 0
          ? "未来 7 天内到期，适合今天提前推进"
          : "未来 7 天内没有临近截止计划",
      icon: "event_upcoming",
      tone: "amber",
      to: targetFor(dueSoonPlans),
    },
  ];
});
</script>

<template>
  <section
    class="mb-6 grid grid-cols-1 gap-3 sm:mb-7 sm:grid-cols-3 sm:gap-4"
    aria-label="概览行动摘要"
    data-testid="dashboard-action-summary"
  >
    <router-link
      v-for="card in actionSummaryCards"
      :key="card.label"
      :to="card.to"
      class="dash-panel group relative overflow-hidden rounded-[1.2rem] border border-white/70 bg-white/78 p-4 shadow-[0_14px_36px_-28px_rgba(15,60,40,0.24),0_0_0_1px_rgba(16,185,129,0.04)_inset] outline-none backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white focus-visible:ring-2 focus-visible:ring-emerald-400/40 active:scale-[0.998]"
      :data-testid="`dashboard-action-card-${card.id}`"
    >
      <div
        class="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full blur-2xl"
        :class="{
          'bg-emerald-200/45': card.tone === 'emerald',
          'bg-rose-200/35': card.tone === 'rose',
          'bg-amber-200/35': card.tone === 'amber',
        }"
        aria-hidden="true"
      />
      <div class="relative flex items-start gap-3">
        <span
          class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/85 shadow-[0_5px_18px_-10px_rgba(15,60,40,0.35)] ring-1"
          :class="{
            'text-emerald-700 ring-emerald-100': card.tone === 'emerald',
            'text-rose-700 ring-rose-100': card.tone === 'rose',
            'text-amber-700 ring-amber-100': card.tone === 'amber',
          }"
          aria-hidden="true"
        >
          <span class="material-symbols-outlined text-[22px]">{{
            card.icon
          }}</span>
        </span>
        <div class="min-w-0">
          <p class="text-[12px] font-bold tracking-tight text-[#5f7067]">
            {{ card.label }}
          </p>
          <p class="mt-1 font-mono text-2xl font-black text-[#0f2918]">
            {{ card.value }} 项
          </p>
          <p class="mt-1 text-[12px] leading-snug text-stone-500">
            {{ card.hint }}
          </p>
        </div>
      </div>
    </router-link>
  </section>
</template>
