<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{
  message: string;
  title?: string;
  durationMs?: number;
}>();

const emit = defineEmits<{
  close: [];
}>();

const visible = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

function clearToastTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function handleClose() {
  visible.value = false;
  clearToastTimer();
  emit('close');
}

watch(
  () => props.message,
  (message) => {
    clearToastTimer();
    if (!message) {
      visible.value = false;
      return;
    }
    visible.value = true;
    timer = setTimeout(() => {
      visible.value = false;
      emit('close');
      timer = null;
    }, props.durationMs ?? 3000);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  clearToastTimer();
});
</script>

<template>
  <div v-if="visible" data-testid="error-toast" class="error-toast">
    <div class="error-toast-icon" aria-hidden="true">!</div>
    <div class="min-w-0 flex-1">
      <p class="error-toast-title">{{ title ?? '请求失败' }}</p>
      <p class="error-toast-message">{{ message }}</p>
    </div>
    <button type="button" class="error-toast-close" aria-label="关闭错误提示" @click="handleClose">×</button>
  </div>
</template>

<style scoped>
.error-toast {
  position: fixed;
  right: 1rem;
  top: 1rem;
  z-index: 60;
  display: flex;
  max-width: min(34rem, calc(100vw - 2rem));
  align-items: flex-start;
  gap: 0.65rem;
  border-radius: 0.95rem;
  border: 1px solid rgba(206, 72, 56, 0.26);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.97), rgba(255, 243, 241, 0.96));
  padding: 0.72rem 0.78rem;
  box-shadow: 0 18px 42px -22px rgba(111, 26, 18, 0.4);
  backdrop-filter: blur(6px);
  animation: toastEnter 220ms ease-out;
}

.error-toast-icon {
  display: inline-flex;
  height: 1.35rem;
  width: 1.35rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(206, 72, 56, 0.16);
  color: #c0392b;
  font-size: 0.75rem;
  font-weight: 900;
}

.error-toast-title {
  margin-bottom: 0.1rem;
  font-size: 0.78rem;
  font-weight: 800;
  color: #7b2b22;
}

.error-toast-message {
  max-height: 6rem;
  overflow: auto;
  white-space: pre-wrap;
  font-size: 0.73rem;
  line-height: 1.35;
  color: #6f3a33;
}

.error-toast-close {
  flex-shrink: 0;
  border-radius: 0.45rem;
  padding: 0 0.4rem;
  color: #915049;
  font-size: 1rem;
  line-height: 1;
  transition: background-color 160ms ease;
}

.error-toast-close:hover {
  background: rgba(206, 72, 56, 0.1);
}

@keyframes toastEnter {
  from {
    transform: translateY(-6px) scale(0.98);
    opacity: 0;
  }
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}
</style>
