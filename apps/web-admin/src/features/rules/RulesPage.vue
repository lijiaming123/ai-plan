<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getAdminApiClient, type AdminRuleRecord } from '../../lib/api-client';
import { adminAuthState } from '../../stores/auth';

const rules = ref<AdminRuleRecord[]>([]);
const error = ref('');
const loading = ref(true);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    rules.value = await getAdminApiClient().getRules(adminAuthState.token);
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
    <span class="badge">规则中心</span>
    <header>
      <h1 class="hero-title">规则配置</h1>
      <p class="hero-subtitle">管理自动判定阈值与证据门槛，确保评估标准清晰可追踪。</p>
    </header>

    <div v-if="loading" class="loading-row" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true" />
      <span>正在加载规则…</span>
    </div>

    <div v-else-if="error" class="error-panel">
      <p class="error-text">{{ error }}</p>
      <button type="button" class="ghost-btn" @click="load">重试</button>
    </div>

    <p v-else-if="rules.length === 0" class="muted-text empty-hint">暂无规则数据。</p>

    <ul v-else class="list">
      <li v-for="rule in rules" :key="rule.id" class="list-item">
        <div class="item-top">
          <strong class="item-key">{{ rule.key }}</strong>
          <span class="pill pill-ok">当前值 {{ rule.value }}</span>
        </div>
        <p class="item-desc">{{ rule.description }}</p>
      </li>
    </ul>
  </section>
</template>
