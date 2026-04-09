<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getAdminApiClient, type AdminDashboardSummary } from '../../lib/api-client';
import { adminAuthState } from '../../stores/auth';

const summary = ref<AdminDashboardSummary | null>(null);
const error = ref('');

onMounted(async () => {
  try {
    summary.value = await getAdminApiClient().getDashboard(adminAuthState.token);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  }
});
</script>

<template>
  <section class="page">
    <span class="badge">运营看板</span>
    <header>
      <h1 class="hero-title">管理后台总览</h1>
      <p class="hero-subtitle">集中查看计划推进、提交流水与规则生效情况。</p>
    </header>
    <p v-if="error" class="error-text">{{ error }}</p>
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
    <p v-else class="muted-text">加载中...</p>
  </section>
</template>
