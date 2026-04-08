<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getAdminApiClient, type AdminRuleRecord } from '../../lib/api-client';
import { adminAuthState } from '../../stores/auth';

const rules = ref<AdminRuleRecord[]>([]);
const error = ref('');

onMounted(async () => {
  try {
    rules.value = await getAdminApiClient().getRules(adminAuthState.token);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  }
});
</script>

<template>
  <section>
    <h1>规则配置</h1>
    <p v-if="error">{{ error }}</p>
    <ul v-else>
      <li v-for="rule in rules" :key="rule.id">
        <strong>{{ rule.key }}</strong>
        <span> - {{ rule.value }}</span>
        <p>{{ rule.description }}</p>
      </li>
    </ul>
  </section>
</template>
