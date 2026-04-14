<script setup lang="ts">
import PageSectionHeading from "../../components/PageSectionHeading.vue";
</script>

<template>
  <div class="flex h-full min-h-0 w-full flex-col overflow-hidden">
    <header class="mb-6 shrink-0">
      <PageSectionHeading kicker="消息与提醒" title="通知中心">
        <p class="max-w-2xl">
          任务截止提醒、审核结果与系统公告将出现在此。当前为占位页，可与 WebSocket 或轮询接口对接。
        </p>
      </PageSectionHeading>
    </header>
    <div class="ui-scrollbar min-h-0 flex-1 overflow-y-auto pr-1 pb-2">
      <div
        class="rounded-2xl border border-dashed border-[#d0d8d3] bg-white/80 p-10 text-center text-sm text-[#7c8a84]"
        data-testid="notifications-empty"
      >
        暂无新通知
      </div>
    </div>
  </div>
</template>
