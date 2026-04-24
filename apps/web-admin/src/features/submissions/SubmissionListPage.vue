<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getAdminApiClient, type AdminSubmissionRecord } from '../../lib/api-client';
import { adminAuthState } from '../../stores/auth';

const submissions = ref<AdminSubmissionRecord[]>([]);
const error = ref('');
const loading = ref(true);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    submissions.value = await getAdminApiClient().getSubmissions(adminAuthState.token);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <section class="page" :aria-busy="loading">
    <span class="badge">提交审计</span>
    <header>
      <h1 class="hero-title">提交审计</h1>
      <p class="hero-subtitle">查看任务提交状态、内容摘要与异常重提风险。</p>
    </header>

    <div v-if="loading" class="loading-row" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true" />
      <span>正在加载提交列表…</span>
    </div>

    <div v-else-if="error" class="error-panel">
      <p class="error-text">{{ error }}</p>
      <button type="button" class="ghost-btn" @click="load">重试</button>
    </div>

    <p v-else-if="submissions.length === 0" class="muted-text empty-hint">暂无提交记录。</p>

    <ul v-else class="list">
      <li v-for="submission in submissions" :key="submission.id" class="list-item">
        <div class="item-top">
          <strong class="item-key">{{ submission.taskId }}</strong>
          <span class="pill" :class="submission.status === 'completed' ? 'pill-ok' : 'pill-warn'">
            {{ submission.status }}
          </span>
        </div>
        <p class="item-desc item-desc--clamp">{{ submission.content }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.item-desc--clamp {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
