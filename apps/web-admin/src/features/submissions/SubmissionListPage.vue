<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getAdminApiClient, type AdminSubmissionRecord } from '../../lib/api-client';
import { adminAuthState } from '../../stores/auth';

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

const submissions = ref<AdminSubmissionRecord[]>([]);
const error = ref('');
const loading = ref(true);

const completedCount = computed(
  () => submissions.value.filter((submission) => submission.status === 'completed').length,
);

const retryCount = computed(
  () => submissions.value.filter((submission) => submission.status !== 'completed').length,
);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    submissions.value = await getAdminApiClient().getSubmissions(adminAuthState.token);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载提交列表失败。';
  } finally {
    loading.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <section class="page page--wide" :aria-busy="loading">
    <span class="badge">提交审计</span>
    <header class="section-stack">
      <h1 class="hero-title">最近提交</h1>
      <p class="hero-subtitle">按最新时间查看任务提交状态、图片数量和内容摘要，优先发现需要重提或需要进一步排查的提交。</p>
    </header>

    <div class="stats-grid">
      <article class="stat-card">
        <span class="stat-label">最近提交数</span>
        <strong class="stat-value">{{ loading ? '--' : submissions.length }}</strong>
        <p class="stat-help">接口当前返回最近 20 条提交。</p>
      </article>
      <article class="stat-card">
        <span class="stat-label">已完成</span>
        <strong class="stat-value">{{ loading ? '--' : completedCount }}</strong>
        <p class="stat-help">状态为 completed 的提交。</p>
      </article>
      <article class="stat-card">
        <span class="stat-label">需关注</span>
        <strong class="stat-value">{{ loading ? '--' : retryCount }}</strong>
        <p class="stat-help">非 completed 状态，适合优先排查。</p>
      </article>
    </div>

    <div v-if="loading" class="loading-row" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true" />
      <span>正在加载提交列表...</span>
    </div>

    <div v-else-if="error" class="error-panel">
      <p class="error-text">{{ error }}</p>
      <button type="button" class="ghost-btn" @click="load">重试</button>
    </div>

    <p v-else-if="submissions.length === 0" class="empty-hint">当前没有提交记录。</p>

    <section v-else class="detail-card">
      <h2 class="detail-card__title">提交列表</h2>
      <table class="report-table">
        <thead>
          <tr>
            <th>任务</th>
            <th>用户</th>
            <th>状态</th>
            <th>图片数</th>
            <th>提交时间</th>
            <th>内容摘要</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="submission in submissions" :key="submission.id">
            <td class="mono">{{ submission.taskId }}</td>
            <td class="mono">{{ submission.userId }}</td>
            <td>
              <span
                class="status-pill"
                :class="submission.status === 'completed' ? 'status-pill--ok' : 'pill-warn'"
              >
                {{ submission.status }}
              </span>
            </td>
            <td>{{ submission.images.length }}</td>
            <td>{{ formatDateTime(submission.createdAt) }}</td>
            <td class="submission-summary">{{ submission.content }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </section>
</template>

<style scoped>
.submission-summary {
  max-width: 22rem;
  color: var(--text-secondary);
  line-height: 1.55;
}
</style>
