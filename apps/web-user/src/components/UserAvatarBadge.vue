<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    /** 邮箱或显示名，用于提取首字 */
    label: string;
    /** default: 标准；featured: 设置页主头像；header: 顶栏触发器；menu: 用户菜单摘要区（略大、与 header 同系） */
    variant?: 'default' | 'featured' | 'header' | 'menu';
  }>(),
  { variant: 'default' },
);

function firstGrapheme(label: string): string {
  const t = label.trim();
  if (!t) return '?';
  try {
    const seg = new Intl.Segmenter('und', { granularity: 'grapheme' });
    const g = [...seg.segment(t)][0]?.segment;
    if (g) {
      if (g.length === 1 && /[a-z]/i.test(g)) return g.toUpperCase();
      return g;
    }
  } catch {
    /* ignore */
  }
  const ch = [...t][0] ?? '?';
  return typeof ch === 'string' && /[a-z]/i.test(ch) ? ch.toUpperCase() : ch;
}

const initial = computed(() => firstGrapheme(props.label));

const innerClass = computed(() => {
  if (props.variant === 'featured') {
    return 'flex size-[4.25rem] items-center justify-center rounded-full bg-gradient-to-b from-white to-emerald-50/90 text-2xl font-bold text-emerald-900 shadow-inner ring-1 ring-emerald-100/80';
  }
  if (props.variant === 'header') {
    return 'flex size-7 items-center justify-center rounded-full bg-gradient-to-b from-white to-emerald-50/95 text-xs font-bold text-emerald-900 shadow-inner ring-1 ring-emerald-100/70';
  }
  if (props.variant === 'menu') {
    return 'flex size-10 items-center justify-center rounded-full bg-gradient-to-b from-white to-emerald-50/95 text-[15px] font-bold leading-none text-emerald-900 shadow-inner ring-1 ring-emerald-100/75';
  }
  return 'flex size-14 items-center justify-center rounded-full bg-gradient-to-b from-emerald-50 to-emerald-100/90 text-lg font-bold text-emerald-900 ring-1 ring-emerald-200/90';
});
</script>

<template>
  <div
    :class="
      variant === 'featured'
        ? 'relative shrink-0 rounded-full bg-gradient-to-br from-[#5ee9b5] via-[#0a8f4a] to-[#047857] p-[3px] shadow-[0_12px_28px_-8px_rgba(10,143,74,0.45)]'
        : variant === 'header'
          ? 'relative inline-flex shrink-0 self-start rounded-full bg-gradient-to-br from-[#5ee9b5] via-[#0a8f4a] to-[#047857] p-0.5 shadow-[0_6px_16px_-6px_rgba(10,143,74,0.4)]'
          : variant === 'menu'
            ? 'relative inline-flex shrink-0 rounded-full bg-gradient-to-br from-[#5ee9b5] via-[#0a8f4a] to-[#047857] p-[2.5px] shadow-[0_10px_24px_-10px_rgba(10,143,74,0.42)]'
            : 'shrink-0'
    "
    aria-hidden="true"
  >
    <div :class="innerClass">
      {{ initial }}
    </div>
  </div>
</template>
