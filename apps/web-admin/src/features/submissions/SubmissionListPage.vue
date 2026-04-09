<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getAdminApiClient, type AdminSubmissionRecord } from '../../lib/api-client';
import { adminAuthState } from '../../stores/auth';

const submissions = ref<AdminSubmissionRecord[]>([]);
const error = ref('');

onMounted(async () => {
  try {
    submissions.value = await getAdminApiClient().getSubmissions(adminAuthState.token);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  }
});
</script>

<template>
  <section class="page">
    <span class="badge">提交审计</span>
    <header>
      <h1 class="hero-title">提交审计</h1>
      <p class="hero-subtitle">查看任务提交状态、内容摘要与异常重提风险。</p>
    </header>
    <p v-if="error" class="error-text">{{ error }}</p>
    <ul v-else class="list">
      <li v-for="submission in submissions" :key="submission.id" class="list-item">
        <div class="item-top">
          <strong class="item-key">{{ submission.taskId }}</strong>
          <span class="pill" :class="submission.status === 'completed' ? 'pill-ok' : 'pill-warn'">
            {{ submission.status }}
          </span>
        </div>
        <p class="item-desc">{{ submission.content }}</p>
      </li>
    </ul>
  </section>
</template>
