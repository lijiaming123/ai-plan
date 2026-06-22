<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getAdminApiClient, type AdminFunnelResponse } from '../../lib/api-client';
import { exportCsvWithAudit } from '../../lib/export-with-audit';
import { adminAuthState, adminProfile } from '../../stores/auth';

function toYmd(d: Date) {
  return d.toISOString().slice(0, 10);
}

const endDate = ref('');
const startDate = ref('');
const windowDays = ref(7);
const source = ref('');
const platform = ref('');
const clientVersion = ref('');

const data = ref<AdminFunnelResponse | null>(null);
const error = ref('');
const loading = ref(false);

const dateError = computed(() => {
  if (!startDate.value || !endDate.value) return '';
  if (startDate.value > endDate.value) return '开始日期不能晚于结束日期。';
  return '';
});

const canSubmit = computed(() => !loading.value && !dateError.value && !!startDate.value && !!endDate.value);
const canExport = computed(() => adminProfile.permissions.includes('analytics:export'));
const exporting = ref(false);

const filterSummary = computed(() => {
  const parts: string[] = [];
  parts.push(`范围 ${startDate.value} ~ ${endDate.value}（UTC）`);
  parts.push(`窗口 ${windowDays.value} 天`);
  if (source.value.trim()) parts.push(`source=${source.value.trim()}`);
  if (platform.value.trim()) parts.push(`platform=${platform.value.trim()}`);
  if (clientVersion.value.trim()) parts.push(`version=${clientVersion.value.trim()}`);
  return parts.join('，');
});

function setQuickRange(days: number) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  endDate.value = toYmd(end);
  startDate.value = toYmd(start);
}

function resetFilters() {
  windowDays.value = 7;
  source.value = '';
  platform.value = '';
  clientVersion.value = '';
  setQuickRange(7);
}

async function load() {
  if (dateError.value) return;
  loading.value = true;
  error.value = '';
  data.value = null;
  try {
    data.value = await getAdminApiClient().getFunnel(adminAuthState.token, {
      start: startDate.value,
      end: endDate.value,
      windowDays: windowDays.value,
      source: source.value.trim() || undefined,
      platform: platform.value.trim() || undefined,
      clientVersion: clientVersion.value.trim() || undefined,
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载漏斗数据失败。';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  setQuickRange(7);
  void load();
});

async function exportCsv() {
  if (!data.value || !canExport.value || exporting.value) return;
  exporting.value = true;
  try {
    await exportCsvWithAudit(adminAuthState.token, {
      filename: `funnel-${data.value.start}-${data.value.end}.csv`,
      columns: [
        { key: 'step', label: '步骤' },
        { key: 'count', label: '人数' },
        { key: 'conversionFromPrev', label: '相对上一阶段' },
      ],
      rows: data.value.steps.map((row) => ({
        step: row.step,
        count: row.count,
        conversionFromPrev:
          row.conversionFromPrev == null ? '' : `${(row.conversionFromPrev * 100).toFixed(1)}%`,
      })),
      action: 'analytics.export',
      summary: `funnel ${filterSummary.value}`,
      meta: { template: data.value.template, start: data.value.start, end: data.value.end },
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : '导出失败。';
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <section class="page page--narrow" :aria-busy="loading">
    <span class="badge">增长分析</span>
    <header class="section-stack">
      <h1 class="hero-title">漏斗分析</h1>
      <p class="hero-subtitle">按时间范围查看从注册、建计划到提交行为的逐步转化，适合快速判断主要流失点。</p>
    </header>

    <form class="filters" @submit.prevent="load">
      <label class="field">
        <span>开始日期 (UTC)</span>
        <input v-model="startDate" type="date" required />
        <p class="field-hint">按 UTC 日历日统计，适合与后端聚合口径对齐。</p>
      </label>
      <label class="field">
        <span>结束日期 (UTC)</span>
        <input v-model="endDate" type="date" required />
        <p v-if="dateError" class="field-error">{{ dateError }}</p>
      </label>
      <label class="field">
        <span>转化窗口（天）</span>
        <input v-model.number="windowDays" type="number" min="1" max="365" />
        <p class="field-hint">表示从上一步到下一步允许的最大间隔天数。</p>
      </label>
      <details class="filters-advanced">
        <summary>更多筛选（可选）</summary>
        <div class="filters-advanced__grid">
          <label class="field">
            <span>渠道 source</span>
            <input v-model="source" type="text" placeholder="可选" autocomplete="off" />
          </label>
          <label class="field">
            <span>平台</span>
            <input v-model="platform" type="text" placeholder="如 web" autocomplete="off" />
          </label>
          <label class="field">
            <span>客户端版本</span>
            <input v-model="clientVersion" type="text" placeholder="可选" autocomplete="off" />
          </label>
        </div>
      </details>
      <div class="filters-actions">
        <div class="quick-range" aria-label="快捷日期范围">
          <button type="button" class="chip-btn" :disabled="loading" @click="setQuickRange(7)">近 7 天</button>
          <button type="button" class="chip-btn" :disabled="loading" @click="setQuickRange(14)">近 14 天</button>
          <button type="button" class="chip-btn" :disabled="loading" @click="setQuickRange(30)">近 30 天</button>
        </div>
        <button type="submit" class="primary-btn" :disabled="!canSubmit">查询</button>
        <button
          type="button"
          class="ghost-btn"
          :disabled="!data || !canExport || exporting"
          :title="canExport ? '导出当前漏斗结果' : '需要 analytics:export 权限'"
          @click="exportCsv"
        >
          {{ exporting ? '导出中...' : '导出 CSV' }}
        </button>
        <button type="button" class="ghost-btn" :disabled="loading" @click="resetFilters">重置</button>
      </div>
      <div class="filters-summary">
        <p class="field-hint">当前口径：{{ filterSummary }}</p>
      </div>
    </form>

    <div v-if="loading" class="loading-row" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true" />
      <span>正在加载漏斗数据...</span>
    </div>

    <div v-else-if="error" class="error-panel">
      <p class="error-text">{{ error }}</p>
      <button type="button" class="ghost-btn" @click="load">重试</button>
    </div>

    <div v-else-if="data" class="table-scroll">
      <table class="report-table">
        <thead>
          <tr>
            <th>步骤</th>
            <th>人数</th>
            <th>相对上一阶段</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in data.steps" :key="idx">
            <td>{{ row.step }}</td>
            <td>{{ row.count }}</td>
            <td>{{ row.conversionFromPrev == null ? '--' : `${(row.conversionFromPrev * 100).toFixed(1)}%` }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="data.steps.every((s) => s.count === 0)" class="empty-hint">
        所选范围内没有命中任何漏斗事件。可以先确认是否有 telemetry 上报，或放宽日期范围再试。
      </p>
      <p class="small-print">窗口 {{ data.windowDays }} 天，统计范围 {{ data.start }} 到 {{ data.end }}。</p>
    </div>
  </section>
</template>
