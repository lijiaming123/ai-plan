<script setup lang="ts">
import type { PlanRecord } from "../../../../lib/api-client";
import { formatDetailDeadline } from "../../../../lib/plan-dates";

defineProps<{
  plan: PlanRecord | null;
  loading: boolean;
  planId: string;
  isDraft: boolean;
  isArchived: boolean;
  isPastPlanDeadline: boolean;
  checkinSchedule: unknown;
  statusLabel: string;
  typeLabel: string;
  breadcrumbTail: string;
  breadcrumbTailTitle: string;
}>();
</script>

<template>
  <nav
    class="mb-6 flex flex-wrap items-center gap-2 text-sm sm:text-base"
    aria-label="面包屑"
  >
    <router-link
      to="/plans"
      class="font-medium text-[#4d7a63] transition hover:text-[#0a8f4a]"
      >我的计划</router-link
    >
    <span class="font-medium text-[#b8d0c4]" aria-hidden="true">/</span>
    <span
      class="min-w-0 max-w-full truncate font-semibold text-[#203029]"
      data-testid="plan-detail-breadcrumb-current"
      :title="breadcrumbTailTitle || undefined"
      >{{ breadcrumbTail }}</span
    >
  </nav>

  <section
    class="plan-detail-hero mb-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_14px_44px_-28px_rgba(12,72,48,0.18)] ring-1 ring-slate-100 sm:p-6"
    data-testid="plan-detail-hero"
  >
    <h1
      class="text-2xl font-black tracking-[-0.03em] text-[#0f1f16] sm:text-3xl"
    >
      {{ plan ? plan.goal : loading ? "加载中…" : "计划详情" }}
    </h1>
    <div v-if="plan" class="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span
        class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ring-1"
        :class="
          plan.status === 'draft'
            ? 'bg-amber-50 text-amber-950 ring-amber-200/90'
            : isArchived
              ? 'bg-slate-100 text-slate-800 ring-slate-200/90'
              : 'bg-emerald-50 text-emerald-900 ring-emerald-200/80'
        "
      >
        {{ statusLabel }}
      </span>
      <span
        v-if="typeLabel"
        class="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200/80"
      >
        {{ typeLabel }}
      </span>
      <span
        v-if="plan.deadline"
        class="text-[13px] font-medium text-[#5a6f62]"
      >
        截止 {{ formatDetailDeadline(plan.deadline) }}
      </span>
      <p
        v-if="plan.parentPlan && !isDraft"
        class="mt-2 w-full text-[13px] leading-relaxed text-[#5a6f62]"
        data-testid="plan-detail-parent-plan-link"
      >
        承接自计划：
        <router-link
          class="font-semibold text-[#0a8f4a] underline decoration-[#dbe6df] underline-offset-2"
          :to="{ name: 'plan-detail', params: { id: plan.parentPlan.id } }"
        >
          {{ plan.parentPlan.goal }}
        </router-link>
      </p>
      <div
        v-if="!isDraft && plan.childPlans && plan.childPlans.length > 0"
        class="mt-2 w-full text-[13px] leading-relaxed text-[#5a6f62]"
        data-testid="plan-detail-child-plans"
      >
        <span class="font-medium text-[#3d5246]">后续计划</span>
        <span class="text-[#7a8a82]">
          （可多次从本计划创建；按创建顺序列出）
        </span>
        <ul class="mt-1.5 list-inside list-decimal space-y-1">
          <li v-for="c in plan.childPlans" :key="c.id">
            <router-link
              class="font-semibold text-[#0a8f4a] underline decoration-[#dbe6df] underline-offset-2"
              :to="{ name: 'plan-detail', params: { id: c.id } }"
            >
              {{ c.goal }}
            </router-link>
          </li>
        </ul>
      </div>
      <span
        v-if="plan.status === 'active' && !isArchived && isPastPlanDeadline"
        class="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] font-bold text-orange-900 ring-1 ring-orange-200/90"
        data-testid="plan-detail-deadline-past-hint"
      >
        已超过截止日，仍可补记打卡
      </span>
      <p
        v-if="plan.status === 'active' && !isArchived && checkinSchedule"
        class="mt-2 w-full text-[13px] leading-relaxed text-[#5a6f62]"
        data-testid="plan-detail-phase-hint"
      >
        你现在处在执行阶段：按下方的打卡段逐项提交说明和证明。即使超过截止日也可以补记，我们会按真实提交情况展示状态。
      </p>
      <p
        v-if="isArchived"
        class="mt-2 w-full text-[13px] font-medium leading-relaxed text-slate-600"
        data-testid="plan-detail-archived-hint"
      >
        本计划已归档：仅可查看，不能编辑打卡表或提交新证明。需要继续时请点下方「移回我的计划」。
      </p>
    </div>
  </section>
</template>
