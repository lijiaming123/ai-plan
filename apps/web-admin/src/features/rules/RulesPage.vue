<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getAdminApiClient, type AdminRuleRecord } from '../../lib/api-client';
import { adminAuthState } from '../../stores/auth';

const rules = ref<AdminRuleRecord[]>([]);
const error = ref('');
const loading = ref(true);

const enabledCount = computed(() => rules.value.filter((rule) => rule.enabled).length);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    rules.value = await getAdminApiClient().getRules(adminAuthState.token);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载规则失败。';
  } finally {
    loading.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <section class="page page--wide" :aria-busy="loading">
    <span class="badge">规则中心</span>
    <header class="section-stack">
      <h1 class="hero-title">规则配置</h1>
      <p class="hero-subtitle">查看当前自动判定阈值与证据门槛，让运营同学能快速确认哪些规则已生效、哪些仍在关闭状态。</p>
    </header>

    <div class="stats-grid">
      <article class="stat-card">
        <span class="stat-label">规则总数</span>
        <strong class="stat-value">{{ loading ? '--' : rules.length }}</strong>
        <p class="stat-help">当前接口返回的全部规则条目。</p>
      </article>
      <article class="stat-card">
        <span class="stat-label">启用中</span>
        <strong class="stat-value">{{ loading ? '--' : enabledCount }}</strong>
        <p class="stat-help">已参与实际判定流程的规则数。</p>
      </article>
      <article class="stat-card">
        <span class="stat-label">已关闭</span>
        <strong class="stat-value">{{ loading ? '--' : rules.length - enabledCount }}</strong>
        <p class="stat-help">当前关闭或暂未启用的规则数。</p>
      </article>
    </div>

    <div v-if="loading" class="loading-row" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true" />
      <span>正在加载规则...</span>
    </div>

    <div v-else-if="error" class="error-panel">
      <p class="error-text">{{ error }}</p>
      <button type="button" class="ghost-btn" @click="load">重试</button>
    </div>

    <p v-else-if="rules.length === 0" class="empty-hint">当前没有规则数据。</p>

    <section v-else class="detail-card">
      <h2 class="detail-card__title">规则列表</h2>
      <table class="report-table">
        <thead>
          <tr>
            <th>规则键</th>
            <th>当前值</th>
            <th>状态</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="rule in rules" :key="rule.id">
            <td class="mono cell-strong">{{ rule.key }}</td>
            <td>{{ rule.value }}</td>
            <td>
              <span class="status-pill" :class="rule.enabled ? 'status-pill--ok' : 'status-pill--muted'">
                {{ rule.enabled ? '已启用' : '已关闭' }}
              </span>
            </td>
            <td>{{ rule.description }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </section>
</template>
