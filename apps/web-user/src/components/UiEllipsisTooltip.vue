<script setup lang="ts">
type Props = {
  content: string;
  /** 行数：默认 2 行省略 */
  lines?: 1 | 2 | 3 | 4 | 5 | 6;
  /** 目标节点的额外 class */
  class?: string;
  /** Tooltip 最大宽度（默认 420） */
  maxWidthPx?: number;
};

const props = withDefaults(defineProps<Props>(), {
  lines: 2,
  maxWidthPx: 420,
});

const clampClass = `line-clamp-${props.lines}`;
const maxWidth = `${props.maxWidthPx}px`;
</script>

<template>
  <ElTooltip
    :content="content"
    placement="top-start"
    :show-after="220"
    effect="light"
    popper-class="ui-ellipsis-tooltip-popper"
  >
    <p
      :class="[
        clampClass,
        'whitespace-pre-wrap text-[13px] leading-relaxed text-[#111813] hover:text-[#0b5c34]',
        props.class,
      ]"
    >
      {{ content }}
    </p>
  </ElTooltip>
</template>

<style>
.ui-ellipsis-tooltip-popper.el-popper {
  max-width: v-bind(maxWidth);
  border-radius: 14px;
  border: 1px solid rgba(214, 229, 220, 0.9);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(246, 250, 247, 0.96));
  box-shadow: 0 18px 44px -26px rgba(12, 72, 48, 0.35);
  backdrop-filter: blur(8px);
  padding: 10px 12px;
  color: #111813;
  font-size: 12px;
  line-height: 1.45;
}
.ui-ellipsis-tooltip-popper .el-popper__arrow::before {
  border: 1px solid rgba(214, 229, 220, 0.9);
  background: rgba(255, 255, 255, 0.98);
}
</style>

