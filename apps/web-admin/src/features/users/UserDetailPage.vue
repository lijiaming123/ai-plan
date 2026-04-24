<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { getAdminApiClient } from '../../lib/api-client';
import type { AdminUserDetail } from '../../lib/api-client';
import { adminAuthState } from '../../stores/auth';

function dashOrIso(v: string | null) {
  return v != null && v !== '' ? v : '—';
}

const route = useRoute();
const detail = ref<AdminUserDetail | null>(null);
const error = ref('');
const notFound = ref(false);
const loading = ref(true);

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
    error.value = err instanceof Error ? err.message : '加载失败';
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
  <section class="page page--narrow" :aria-busy="loading">
    <span class="badge">用户</span>
    <router-link class="back-link" to="/admin/users">← 返回列表</router-link>

    <header>
      <h1 class="hero-title">用户画像（最小）</h1>
      <p v-if="detail" class="mono id-line">{{ detail.userId }}</p>
    </header>

    <div v-if="loading" class="loading-row" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true" />
      <span>正在加载用户详情…</span>
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

    <p v-else-if="notFound" class="muted-text empty-hint">未找到该 userId 或无任何业务/遥测记录。</p>

    <div v-else-if="detail" class="detail-grid">
      <section class="detail-card">
        <h2 class="detail-card__title">关键计数</h2>
        <ul class="stat-list">
          <li><span>计划数</span> <strong>{{ detail.planCount }}</strong></li>
          <li><span>打卡提交数</span> <strong>{{ detail.checkinSubmissionCount }}</strong></li>
          <li><span>任务提交数</span> <strong>{{ detail.taskSubmissionCount }}</strong></li>
          <li><span>Telemetry 事件条数</span> <strong>{{ detail.telemetryEventCount }}</strong></li>
        </ul>
      </section>

      <section class="detail-card">
        <h2 class="detail-card__title">时间线（近似）</h2>
        <ul class="stat-list">
          <li>
            <span>注册（首次 auth_register）</span>
            <strong>{{ dashOrIso(detail.registeredAtApprox) }}</strong>
          </li>
          <li>
            <span>最早活动</span>
            <strong>{{ dashOrIso(detail.firstActivityAt) }}</strong>
          </li>
          <li>
            <span>最近活动</span>
            <strong>{{ dashOrIso(detail.lastActivityAt) }}</strong>
          </li>
        </ul>
      </section>

      <section class="detail-card">
        <h2 class="detail-card__title">Telemetry 事件 Top</h2>
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
        <p v-if="detail.telemetryTopEvents.length === 0" class="muted-text small-print">暂无 Telemetry。</p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.id-line {
  margin: 0 0 1.25rem;
  font-size: 0.92rem;
  color: var(--text-primary);
  word-break: break-all;
}

.detail-grid {
  display: grid;
  gap: 1rem;
}
</style>
