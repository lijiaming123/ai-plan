<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getAdminApiClient, type AdminAuditLogRecord } from '../../lib/api-client';
import { adminAuthState } from '../../stores/auth';

const limit = ref(50);
const actorId = ref('');
const action = ref('');
const from = ref('');
const to = ref('');

const rows = ref<AdminAuditLogRecord[]>([]);
const error = ref('');
const loading = ref(false);

function displayText(value: string | null | undefined, fallback = '--') {
  const v = typeof value === 'string' ? value.trim() : '';
  return v ? v : fallback;
}

function displayTarget(type: string | null, id: string | null) {
  const t = displayText(type, '--');
  const tid = typeof id === 'string' ? id.trim() : '';
  return { type: t, id: tid };
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

const canSubmit = computed(() => !loading.value && limit.value >= 1 && limit.value <= 200);

async function load() {
  if (!canSubmit.value) return;
  loading.value = true;
  error.value = '';
  try {
    rows.value = await getAdminApiClient().getAuditLogs(adminAuthState.token, {
      limit: limit.value,
      actorId: actorId.value.trim() || undefined,
      action: action.value.trim() || undefined,
      from: from.value.trim() || undefined,
      to: to.value.trim() || undefined,
    });
  } catch (err) {
    rows.value = [];
    error.value = err instanceof Error ? err.message : '加载审计日志失败。';
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  limit.value = 50;
  actorId.value = '';
  action.value = '';
  from.value = '';
  to.value = '';
  void load();
}

onMounted(() => void load());
</script>

<template>
  <section class="page page--wide" :aria-busy="loading">
    <span class="badge">合规留痕</span>
    <header class="section-stack">
      <h1 class="hero-title">审计日志</h1>
      <p class="hero-subtitle">
        记录后台治理相关动作，支持按操作者、动作类型与时间范围检索。建议先用较小的时间窗口定位，再逐步放宽范围。
      </p>
    </header>

    <form class="filters" @submit.prevent="load">
      <label class="field">
        <span>条数</span>
        <input v-model.number="limit" type="number" min="1" max="200" />
        <p class="field-hint">最多 200 条，默认 50。</p>
      </label>
      <label class="field field--grow">
        <span>actorId</span>
        <input v-model="actorId" type="text" placeholder="可选" autocomplete="off" />
      </label>
      <label class="field field--grow">
        <span>action</span>
        <input v-model="action" type="text" placeholder="可选（如 rbac.grant）" autocomplete="off" />
      </label>
      <label class="field">
        <span>开始时间</span>
        <input v-model="from" type="datetime-local" />
      </label>
      <label class="field">
        <span>结束时间</span>
        <input v-model="to" type="datetime-local" />
      </label>

      <div class="filters-actions">
        <button type="submit" class="primary-btn" :disabled="!canSubmit">查询</button>
        <button type="button" class="ghost-btn" :disabled="loading" @click="resetFilters">重置</button>
      </div>
    </form>

    <div v-if="loading" class="loading-row" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true" />
      <span>正在加载审计日志...</span>
    </div>

    <div v-else-if="error" class="error-panel">
      <p class="error-text">{{ error }}</p>
      <button type="button" class="ghost-btn" @click="load">重试</button>
    </div>

    <p v-else-if="rows.length === 0" class="empty-hint">当前范围没有审计记录。</p>

    <section v-else class="detail-card">
      <h2 class="detail-card__title">最近记录</h2>
      <div class="table-scroll">
        <table class="report-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>操作者</th>
              <th>动作</th>
              <th>目标</th>
              <th>摘要</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id">
              <td class="mono">{{ formatDateTime(r.createdAt) }}</td>
              <td>
                <span class="cell-strong mono">{{ r.actorEmail }}</span>
                <span class="cell-muted mono">{{ r.actorId }}</span>
              </td>
              <td class="mono">{{ r.action }}</td>
              <td class="mono">
                <span class="cell-strong">{{ displayTarget(r.targetType, r.targetId).type }}</span>
                <span class="cell-muted">{{ displayTarget(r.targetType, r.targetId).id }}</span>
              </td>
              <td class="audit-summary">{{ displayText(r.summary, '--') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="small-print">仅展示最近 {{ rows.length }} 条；建议使用时间范围筛选定位关键事件。</p>
    </section>
  </section>
</template>

<style scoped>
.audit-summary {
  max-width: 34rem;
  line-height: 1.55;
}
</style>

