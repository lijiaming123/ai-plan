<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getAdminApiClient, type AdminAuditLogRecord } from '../../lib/api-client';
import {
  auditActionLabel,
  isHighRiskAuditAction,
} from '../../lib/audit-action-dictionary';
import { exportCsvWithAudit } from '../../lib/export-with-audit';
import { adminAuthState, adminProfile } from '../../stores/auth';

const limit = ref(50);
const actorId = ref('');
const action = ref('');
const from = ref('');
const to = ref('');
const highRiskOnly = ref(false);

const rows = ref<AdminAuditLogRecord[]>([]);
const error = ref('');
const loading = ref(false);
const exporting = ref(false);

const canExport = computed(() => adminProfile.permissions.includes('analytics:export'));

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

const visibleRows = computed(() => {
  if (!highRiskOnly.value) return rows.value;
  return rows.value.filter((r) => isHighRiskAuditAction(r.action));
});

const highRiskCount = computed(() => rows.value.filter((r) => isHighRiskAuditAction(r.action)).length);

const exportCount = computed(() => rows.value.filter((r) => r.action.includes('export')).length);

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
  highRiskOnly.value = false;
  void load();
}

function applyHighRiskFilter() {
  highRiskOnly.value = true;
  action.value = '';
}

async function exportCsv() {
  if (!canExport.value || exporting.value || visibleRows.value.length === 0) return;
  exporting.value = true;
  try {
    await exportCsvWithAudit(adminAuthState.token, {
      filename: `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`,
      columns: [
        { key: 'createdAt', label: '时间' },
        { key: 'actorEmail', label: '操作者' },
        { key: 'action', label: '动作' },
        { key: 'target', label: '目标' },
        { key: 'summary', label: '摘要' },
      ],
      rows: visibleRows.value.map((r) => ({
        createdAt: formatDateTime(r.createdAt),
        actorEmail: r.actorEmail,
        action: r.action,
        target: `${displayTarget(r.targetType, r.targetId).type}:${displayTarget(r.targetType, r.targetId).id}`,
        summary: displayText(r.summary),
      })),
      action: 'audit.export',
      summary: `audit rows=${visibleRows.value.length} highRisk=${highRiskOnly.value}`,
      meta: { limit: limit.value, actorId: actorId.value, action: action.value },
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : '导出失败。';
  } finally {
    exporting.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <section class="page page--wide" :aria-busy="loading">
    <span class="badge">合规留痕</span>
    <header class="section-stack">
      <h1 class="hero-title">审计工作台</h1>
      <p class="hero-subtitle">
        记录后台治理相关动作，支持按操作者、动作类型与时间范围检索。审计员默认以此页为首页。
      </p>
    </header>

    <div class="stats-grid stats-grid--tight">
      <article class="stat-card">
        <span class="stat-label">当前结果</span>
        <strong class="stat-value">{{ rows.length }}</strong>
        <p class="stat-help">本次查询返回条数。</p>
      </article>
      <article class="stat-card">
        <span class="stat-label">高风险</span>
        <strong class="stat-value">{{ highRiskCount }}</strong>
        <p class="stat-help">含 rbac / export / disable 等动作。</p>
      </article>
      <article class="stat-card">
        <span class="stat-label">导出类</span>
        <strong class="stat-value">{{ exportCount }}</strong>
        <p class="stat-help">analytics.export / audit.export。</p>
      </article>
    </div>

    <div class="chip-row">
      <button type="button" class="chip-btn" :class="{ 'chip-btn--active': highRiskOnly }" @click="applyHighRiskFilter">
        仅看高风险
      </button>
      <button type="button" class="chip-btn" :disabled="!highRiskOnly" @click="highRiskOnly = false">显示全部</button>
      <button
        type="button"
        class="ghost-btn"
        :disabled="!canExport || exporting || visibleRows.length === 0"
        @click="exportCsv"
      >
        {{ exporting ? '导出中...' : '导出 CSV' }}
      </button>
    </div>

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
        <input v-model="action" type="text" placeholder="可选（如 rbac.admin.create）" autocomplete="off" />
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

    <p v-else-if="visibleRows.length === 0" class="empty-hint">当前范围没有审计记录。</p>

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
            <tr v-for="r in visibleRows" :key="r.id">
              <td class="mono">{{ formatDateTime(r.createdAt) }}</td>
              <td>
                <span class="cell-strong mono">{{ r.actorEmail }}</span>
                <span class="cell-muted mono">{{ r.actorId }}</span>
              </td>
              <td class="mono">
                <span>{{ auditActionLabel(r.action) }}</span>
                <span class="cell-muted">{{ r.action }}</span>
              </td>
              <td class="mono">
                <span class="cell-strong">{{ displayTarget(r.targetType, r.targetId).type }}</span>
                <span class="cell-muted">{{ displayTarget(r.targetType, r.targetId).id }}</span>
              </td>
              <td class="audit-summary">{{ displayText(r.summary, '--') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="small-print">展示 {{ visibleRows.length }} 条；建议使用时间范围筛选定位关键事件。</p>
    </section>
  </section>
</template>

<style scoped>
.stats-grid--tight {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  margin-bottom: 1rem;
}

.audit-summary {
  max-width: 34rem;
  line-height: 1.55;
}
</style>
