<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getAdminApiClient, type AdminDashboardSummary } from '../../lib/api-client';
import { adminAuthState } from '../../stores/auth';

const summary = ref<AdminDashboardSummary | null>(null);
const error = ref('');
const loading = ref(true);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    summary.value = await getAdminApiClient().getDashboard(adminAuthState.token);
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
    <span class="badge">运营看板</span>
    <header>
      <h1 class="hero-title">管理后台总览</h1>
      <p class="hero-subtitle">集中查看计划推进、提交流水与规则生效情况。</p>
    </header>

    <div v-if="loading" class="loading-row" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true" />
      <span>正在加载总览数据…</span>
    </div>

    <div v-else-if="error" class="error-panel">
      <p class="error-text">{{ error }}</p>
      <button type="button" class="ghost-btn" @click="load">重试</button>
    </div>

    <div v-else-if="summary" class="stats-grid">
      <article class="stat-card">
        <div class="stat-label">计划数</div>
        <div class="stat-value">{{ summary.planCount }}</div>
      </article>
      <article class="stat-card">
        <div class="stat-label">提交数</div>
        <div class="stat-value">{{ summary.submissionCount }}</div>
      </article>
      <article class="stat-card">
        <div class="stat-label">规则数</div>
        <div class="stat-value">{{ summary.ruleCount }}</div>
      </article>
      <article class="stat-card">
        <div class="stat-label">完成数</div>
        <div class="stat-value">{{ summary.completedCount }}</div>
      </article>
      <article class="stat-card">
        <div class="stat-label">需重提</div>
        <div class="stat-value">{{ summary.retryCount }}</div>
      </article>
    </div>
  </section>
</template>
