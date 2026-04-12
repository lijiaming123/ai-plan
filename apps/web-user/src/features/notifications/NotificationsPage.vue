<template>
  <div class="ui-scrollbar h-full overflow-y-auto pr-1">
    <h1 class="mb-2 text-[46px] font-black leading-none tracking-[-0.03em]">通知中心</h1>
    <p class="mb-6 max-w-2xl text-sm leading-relaxed text-[#5d6a64]">
      任务截止提醒、审核结果与系统公告将出现在此。当前为占位页，可与 WebSocket 或轮询接口对接。
    </p>
    <div
      class="rounded-2xl border border-dashed border-[#d0d8d3] bg-white/80 p-10 text-center text-sm text-[#7c8a84]"
      data-testid="notifications-empty"
    >
      暂无新通知
    </div>
  </div>
</template>
