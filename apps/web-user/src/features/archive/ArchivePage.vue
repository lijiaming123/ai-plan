<script setup lang="ts">
import PageSectionHeading from "../../components/PageSectionHeading.vue";
</script>

<template>
  <div class="ui-scrollbar h-full overflow-y-auto pr-1">
    <header class="mb-6">
      <PageSectionHeading kicker="历史与回顾" title="归档">
        <p class="max-w-2xl">
          已结束或手动归档的计划将集中展示在此，便于回顾与检索。当前为占位页，后续可对接「归档」状态与批量操作。
        </p>
      </PageSectionHeading>
    </header>
    <div
      class="rounded-2xl border border-dashed border-[#d0d8d3] bg-white/80 p-10 text-center text-sm text-[#7c8a84]"
      data-testid="archive-empty"
    >
      暂无归档计划
    </div>
  </div>
</template>
