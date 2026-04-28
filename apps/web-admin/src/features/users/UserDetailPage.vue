<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { getAdminApiClient } from '../../lib/api-client';
import type { AdminUserDetail } from '../../lib/api-client';
import { adminAuthState } from '../../stores/auth';

function formatDateTime(value: string | null) {
  if (!value) return '暂无记录';
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

const route = useRoute();
const detail = ref<AdminUserDetail | null>(null);
const error = ref('');
const notFound = ref(false);
const loading = ref(true);

const totalSubmissions = computed(
  () => (detail.value?.checkinSubmissionCount ?? 0) + (detail.value?.taskSubmissionCount ?? 0),
);

const activityLevel = computed(() => {
  const count = detail.value?.telemetryEventCount ?? 0;
  if (count >= 20) return '高活跃';
  if (count >= 5) return '中活跃';
  if (count >= 1) return '低活跃';
  return '暂无行为';
});

const topEvent = computed(() => detail.value?.telemetryTopEvents[0] ?? null);

async function load(userId: string) {
  loading.value = true;
  error.value = '';
  notFound.value = false;
  detail.value = null;
  try {
    detail.value = await getAdminApiClient().getUser(adminAuthState.token, userId);
  } catch (err) {
    if (err instanceof Error && err.message.includes('404')) {
      notFound.value = true;
      return;
    }
    error.value = err instanceof Error ? err.message : '加载用户详情失败。';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  const id = route.params.userId;
  if (typeof id === 'string') void load(decodeURIComponent(id));
});

watch(
  () => route.params.userId,
  (id) => {
    if (typeof id === 'string') void load(decodeURIComponent(id));
  },
);
</script>

<template>
  <section class="page page--wide" :aria-busy="loading">
    <span class="badge">用户管理</span>
    <router-link class="back-link" to="/admin/users">返回列表</router-link>

    <header class="section-stack">
      <h1 class="hero-title">用户画像</h1>
      <p v-if="detail" class="mono id-line">{{ detail.userId }}</p>
      <p class="hero-subtitle">从计划、提交和 telemetry 三个维度查看这个业务用户的最小画像，方便快速判断用户活跃度与最近行为。</p>
    </header>

    <div v-if="loading" class="loading-row" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true" />
      <span>正在加载用户详情...</span>
    </div>

    <div v-else-if="error" class="error-panel">
      <p class="error-text">{{ error }}</p>
      <button
        v-if="typeof route.params.userId === 'string'"
        type="button"
        class="ghost-btn"
        @click="load(decodeURIComponent(route.params.userId))"
      >
        重试
      </button>
    </div>

    <p v-else-if="notFound" class="empty-hint">未找到该 userId，或该用户目前没有任何业务行为记录。</p>

    <template v-else-if="detail">
      <div class="info-panel">
        <p class="info-panel__title">快速判断</p>
        <p class="info-panel__body">
          当前用户为 <strong>{{ activityLevel }}</strong>，最近活动时间为
          <strong>{{ formatDateTime(detail.lastActivityAt) }}</strong
          >。
          <template v-if="topEvent">
            最常见事件是 <code>{{ topEvent.eventName }}</code>，共 {{ topEvent.count }} 次。
          </template>
        </p>
      </div>

      <div class="stats-grid">
        <article class="stat-card">
          <span class="stat-label">计划数</span>
          <strong class="stat-value">{{ detail.planCount }}</strong>
          <p class="stat-help">该用户创建或持有的计划数量。</p>
        </article>
        <article class="stat-card">
          <span class="stat-label">提交总数</span>
          <strong class="stat-value">{{ totalSubmissions }}</strong>
          <p class="stat-help">包含打卡提交和任务提交。</p>
        </article>
        <article class="stat-card">
          <span class="stat-label">Telemetry 事件</span>
          <strong class="stat-value">{{ detail.telemetryEventCount }}</strong>
          <p class="stat-help">用于观察最近的使用密度。</p>
        </article>
        <article class="stat-card">
          <span class="stat-label">活跃等级</span>
          <strong class="stat-value stat-value--small">{{ activityLevel }}</strong>
          <p class="stat-help">按事件总量做粗粒度判断。</p>
        </article>
      </div>

      <div class="detail-grid detail-grid--columns">
        <section class="detail-card">
          <h2 class="detail-card__title">行为计数</h2>
          <ul class="stat-list">
            <li><span>计划数</span> <strong>{{ detail.planCount }}</strong></li>
            <li><span>打卡提交数</span> <strong>{{ detail.checkinSubmissionCount }}</strong></li>
            <li><span>任务提交数</span> <strong>{{ detail.taskSubmissionCount }}</strong></li>
            <li><span>Telemetry 事件数</span> <strong>{{ detail.telemetryEventCount }}</strong></li>
          </ul>
        </section>

        <section class="detail-card">
          <h2 class="detail-card__title">时间线</h2>
          <ul class="stat-list">
            <li>
              <span>注册近似时间</span>
              <strong>{{ formatDateTime(detail.registeredAtApprox) }}</strong>
            </li>
            <li>
              <span>最早活动</span>
              <strong>{{ formatDateTime(detail.firstActivityAt) }}</strong>
            </li>
            <li>
              <span>最近活动</span>
              <strong>{{ formatDateTime(detail.lastActivityAt) }}</strong>
            </li>
          </ul>
        </section>
      </div>

      <section class="detail-card">
        <h2 class="detail-card__title">Telemetry Top Events</h2>
        <table class="mini-table">
          <thead>
            <tr>
              <th>事件</th>
              <th>次数</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in detail.telemetryTopEvents" :key="row.eventName">
              <td class="mono">{{ row.eventName }}</td>
              <td>{{ row.count }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="detail.telemetryTopEvents.length === 0" class="small-print">当前没有可展示的 telemetry 事件。</p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.id-line {
  margin: 0;
  font-size: 0.92rem;
  color: var(--text-primary);
  word-break: break-all;
}
</style>
