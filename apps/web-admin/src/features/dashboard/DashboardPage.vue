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
  <section>
    <h1>管理后台总览</h1>
    <p v-if="error">{{ error }}</p>
    <div v-else-if="summary">
      <p>计划数：{{ summary.planCount }}</p>
      <p>提交数：{{ summary.submissionCount }}</p>
      <p>规则数：{{ summary.ruleCount }}</p>
      <p>完成数：{{ summary.completedCount }}</p>
      <p>需重提：{{ summary.retryCount }}</p>
    </div>
    <p v-else>加载中...</p>
  </section>
</template>
