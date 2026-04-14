<script setup lang="ts">
import PageSectionHeading from "../../components/PageSectionHeading.vue";
</script>

<template>
  <div class="flex h-full min-h-0 w-full flex-col overflow-hidden">
    <header class="mb-6 shrink-0">
      <PageSectionHeading kicker="数据洞察" title="统计分析">
        <p class="max-w-2xl">
          汇总完成率、逾期任务、阶段耗时等指标。以下为占位布局，后续可接入报表 API 与图表组件。
        </p>
      </PageSectionHeading>
    </header>
    <div class="ui-scrollbar min-h-0 flex-1 overflow-y-auto pr-1 pb-2">
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div class="rounded-2xl border border-[#e6ebe8] bg-white p-5 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-wide text-[#7c8a84]">进行中计划</p>
        <p class="mt-2 text-3xl font-black text-[#0a8f4a]">—</p>
      </div>
      <div class="rounded-2xl border border-[#e6ebe8] bg-white p-5 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-wide text-[#7c8a84]">本周完成任务</p>
        <p class="mt-2 text-3xl font-black text-[#111813]">—</p>
      </div>
      <div class="rounded-2xl border border-[#e6ebe8] bg-white p-5 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-wide text-[#7c8a84]">平均进度</p>
        <p class="mt-2 text-3xl font-black text-[#111813]">—</p>
      </div>
    </div>
    </div>
  </div>
</template>
