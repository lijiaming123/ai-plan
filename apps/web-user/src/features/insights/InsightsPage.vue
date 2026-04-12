<template>
  <div class="ui-scrollbar h-full overflow-y-auto pr-1">
    <h1 class="mb-2 text-[46px] font-black leading-none tracking-[-0.03em]">统计分析</h1>
    <p class="mb-6 max-w-2xl text-sm leading-relaxed text-[#5d6a64]">
      汇总完成率、逾期任务、阶段耗时等指标。以下为占位布局，后续可接入报表 API 与图表组件。
    </p>
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
</template>
