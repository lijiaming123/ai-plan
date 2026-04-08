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
  <section>
    <h1>提交审计</h1>
    <p v-if="error">{{ error }}</p>
    <ul v-else>
      <li v-for="submission in submissions" :key="submission.id">
        <strong>{{ submission.taskId }}</strong>
        <span> - {{ submission.status }}</span>
        <p>{{ submission.content }}</p>
      </li>
    </ul>
  </section>
</template>
