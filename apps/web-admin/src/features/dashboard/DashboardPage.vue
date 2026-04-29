<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getAdminApiClient, type AdminDashboardSummary } from '../../lib/api-client';
import { adminAuthState } from '../../stores/auth';

const summary = ref<AdminDashboardSummary | null>(null);
const error = ref('');
const loading = ref(true);

const completionRate = computed(() => {
  if (!summary.value || summary.value.submissionCount === 0) return '0%';
  return `${((summary.value.completedCount / summary.value.submissionCount) * 100).toFixed(1)}%`;
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    summary.value = await getAdminApiClient().getDashboard(adminAuthState.token);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载总览失败。';
  } finally {
    loading.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <section class="page page--wide" :aria-busy="loading">
    <span class="badge">运营总览</span>
    <header class="section-stack">
      <h1 class="hero-title">控制台总览</h1>
      <p class="hero-subtitle">集中查看计划推进、提交处理和规则运行状态，先看关键指标，再进入具体模块。</p>
    </header>

    <div v-if="loading" class="loading-row" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true" />
      <span>正在加载总览数据...</span>
    </div>

    <div v-else-if="error" class="error-panel">
      <p class="error-text">{{ error }}</p>
      <button type="button" class="ghost-btn" @click="load">重新加载</button>
    </div>

    <template v-else-if="summary">
      <div class="stats-grid">
        <article class="stat-card">
          <span class="stat-label">计划数</span>
          <strong class="stat-value">{{ summary.planCount }}</strong>
          <p class="stat-help">当前累计生成的计划数量。</p>
        </article>
        <article class="stat-card">
          <span class="stat-label">提交数</span>
          <strong class="stat-value">{{ summary.submissionCount }}</strong>
          <p class="stat-help">任务与打卡提交总量。</p>
        </article>
        <article class="stat-card">
          <span class="stat-label">规则数</span>
          <strong class="stat-value">{{ summary.ruleCount }}</strong>
          <p class="stat-help">当前生效的规则配置条目。</p>
        </article>
        <article class="stat-card">
          <span class="stat-label">完成率</span>
          <strong class="stat-value">{{ completionRate }}</strong>
          <p class="stat-help">按提交总数计算的完成占比。</p>
        </article>
      </div>

      <div class="detail-grid detail-grid--columns">
        <section class="detail-card">
          <h2 class="detail-card__title">处理状态</h2>
          <ul class="stat-list">
            <li><span>已完成</span> <strong>{{ summary.completedCount }}</strong></li>
            <li><span>待重提</span> <strong>{{ summary.retryCount }}</strong></li>
            <li><span>总提交</span> <strong>{{ summary.submissionCount }}</strong></li>
          </ul>
        </section>

        <section class="detail-card">
          <h2 class="detail-card__title">观察建议</h2>
          <div class="chip-row">
            <span class="status-pill status-pill--ok">先看总量</span>
            <span class="status-pill status-pill--muted">再看异常流转</span>
          </div>
          <p class="small-print">
            如果待重提数量明显升高，优先检查规则中心和最新提交流水，再回到用户画像页排查集中异常用户。
          </p>
        </section>
      </div>

      <section class="detail-card">
        <h2 class="detail-card__title">最近提交</h2>
        <table class="mini-table">
          <thead>
            <tr>
              <th>提交 ID</th>
              <th>用户</th>
              <th>任务</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in summary.recentSubmissions" :key="item.id">
              <td class="mono">{{ item.id }}</td>
              <td class="mono">{{ item.userId }}</td>
              <td class="mono">{{ item.taskId }}</td>
              <td>{{ item.status }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="summary.recentSubmissions.length === 0" class="small-print">当前没有最近提交记录。</p>
      </section>
    </template>
  </section>
</template>
