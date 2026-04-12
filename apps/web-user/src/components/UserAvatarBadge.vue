<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    /** 邮箱或显示名，用于提取首字 */
    label: string;
    /** default: 标准；featured: 设置页主头像，带渐变环 */
    variant?: 'default' | 'featured';
  }>(),
  { variant: 'default' },
);

function firstGrapheme(label: string): string {
  const t = label.trim();
  if (!t) return '?';
  try {
    const seg = new Intl.Segmenter('und', { granularity: 'grapheme' });
    const g = [...seg.segment(t)][0]?.segment;
    if (g && g.length > 0) {
      const ch = g[0]!;
      return /[a-z]/i.test(ch) ? ch.toUpperCase() : ch;
    }
  } catch {
    /* ignore */
  }
  const ch = [...t][0] ?? '?';
  return typeof ch === 'string' && /[a-z]/i.test(ch) ? ch.toUpperCase() : ch;
}

const initial = computed(() => firstGrapheme(props.label));

const innerClass = computed(() =>
  props.variant === 'featured'
    ? 'flex size-[4.25rem] items-center justify-center rounded-full bg-gradient-to-b from-white to-emerald-50/90 text-2xl font-bold text-emerald-900 shadow-inner ring-1 ring-emerald-100/80'
    : 'flex size-14 items-center justify-center rounded-full bg-gradient-to-b from-emerald-50 to-emerald-100/90 text-lg font-bold text-emerald-900 ring-1 ring-emerald-200/90',
);
</script>

<template>
  <div
    :class="
      variant === 'featured'
        ? 'relative shrink-0 rounded-full bg-gradient-to-br from-[#5ee9b5] via-[#0a8f4a] to-[#047857] p-[3px] shadow-[0_12px_28px_-8px_rgba(10,143,74,0.45)]'
        : 'shrink-0'
    "
    aria-hidden="true"
  >
    <div :class="innerClass">
      {{ initial }}
    </div>
  </div>
</template>
