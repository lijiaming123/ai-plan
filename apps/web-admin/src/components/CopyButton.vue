<script setup lang="ts">
import { computed } from 'vue';
import { showToast } from '../stores/toast';

const props = defineProps<{
  value: string;
  label?: string;
}>();

const aria = computed(() => props.label ?? '复制');

async function copy() {
  try {
    await navigator.clipboard.writeText(props.value);
    showToast('已复制到剪贴板', 'success');
  } catch {
    showToast('复制失败，请手动选择复制', 'warn', 2200);
  }
}
</script>

<template>
  <button type="button" class="copy-btn" :aria-label="aria" @click="copy">复制</button>
</template>

