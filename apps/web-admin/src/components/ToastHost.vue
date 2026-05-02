<script setup lang="ts">
import { computed } from 'vue';
import { closeToast, toastState } from '../stores/toast';

const classes = computed(() => [
  'toast',
  toastState.open ? 'toast--open' : '',
  toastState.kind ? `toast--${toastState.kind}` : '',
]);
</script>

<template>
  <div class="toast-wrap" aria-live="polite" aria-atomic="true">
    <div :class="classes" role="status">
      <span class="toast__msg">{{ toastState.message }}</span>
      <button type="button" class="toast__close" aria-label="关闭提示" @click="closeToast">×</button>
    </div>
  </div>
</template>

