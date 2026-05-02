<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getAdminApiClient } from '../../lib/api-client';
import type { AdminRetentionResponse, AdminRetentionRow } from '../../lib/api-client';
import { adminAuthState } from '../../stores/auth';

function toYmd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function retainedAt(row: AdminRetentionRow, n: number) {
  const c = row.retained[String(n)];
  return c ?? { count: 0, rate: 0 };
}

const cohortEnd = ref('');
const cohortStart = ref('');
const offsetsText = ref('1,7,30');
const source = ref('');
const platform = ref('');
const clientVersion = ref('');

const data = ref<AdminRetentionResponse | null>(null);
const error = ref('');
const loading = ref(false);

function parseOffsets(text: string) {
  const raw = text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const nums = raw
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 365);
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

const offsetsPreview = computed(() => parseOffsets(offsetsText.value));

const dateError = computed(() => {
  if (!cohortStart.value || !cohortEnd.value) return '';
  if (cohortStart.value > cohortEnd.value) return 'Cohort 开始日期不能晚于结束日期。';
  return '';
});

const offsetsError = computed(() => {
  const trimmed = offsetsText.value.trim();
  if (!trimmed) return '';
  const parsed = offsetsPreview.value;
  if (parsed.length === 0) return '留存偏移请输入正整数（例如 1,7,30）。';
  if (parsed.length > 8) return '偏移日过多会降低可读性，建议控制在 8 个以内。';
  return '';
});

const canSubmit = computed(() => !loading.value && !dateError.value && !offsetsError.value);

const filterSummary = computed(() => {
  const parts: string[] = [];
  parts.push(`Cohort ${cohortStart.value} ~ ${cohortEnd.value}（UTC）`);
  parts.push(`偏移 ${offsetsPreview.value.length ? offsetsPreview.value.join(',') : '—'}`);
  if (source.value.trim()) parts.push(`source=${source.value.trim()}`);
  if (platform.value.trim()) parts.push(`platform=${platform.value.trim()}`);
  if (clientVersion.value.trim()) parts.push(`version=${clientVersion.value.trim()}`);
  return parts.join('，');
});

function setQuickCohort(days: number) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  cohortEnd.value = toYmd(end);
  cohortStart.value = toYmd(start);
}

function resetFilters() {
  offsetsText.value = '1,7,30';
  source.value = '';
  platform.value = '';
  clientVersion.value = '';
  setQuickCohort(30);
}

const sortedOffsets = computed(() => {
  if (!data.value) return [];
  return [...data.value.offsets].sort((a, b) => a - b);
});

async function load() {
  if (dateError.value || offsetsError.value) return;
  loading.value = true;
  error.value = '';
  data.value = null;
  try {
    data.value = await getAdminApiClient().getRetention(adminAuthState.token, {
      cohortStart: cohortStart.value,
      cohortEnd: cohortEnd.value,
      offsets: offsetsText.value.trim() || undefined,
      source: source.value.trim() || undefined,
      platform: platform.value.trim() || undefined,
      clientVersion: clientVersion.value.trim() || undefined,
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载留存数据失败。';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  setQuickCohort(30);
  void load();
});
</script>

<template>
  <section class="page page--wide" :aria-busy="loading">
    <span class="badge">增长分析</span>
    <header class="section-stack">
      <h1 class="hero-title">留存分析</h1>
      <p class="hero-subtitle">
        Cohort 以用户首次 <code>auth_register</code> 的 UTC 日期为准；活跃行为按
        <code>dashboard_view</code> 或 <code>checkin_submit</code> 任一出现计入留存。
      </p>
    </header>

    <form class="filters" @submit.prevent="load">
      <label class="field">
        <span>Cohort 开始日期 (UTC)</span>
        <input v-model="cohortStart" type="date" required />
        <p class="field-hint">按 UTC 日历日切分 cohort，避免跨时区误差。</p>
      </label>
      <label class="field">
        <span>Cohort 结束日期 (UTC)</span>
        <input v-model="cohortEnd" type="date" required />
        <p v-if="dateError" class="field-error">{{ dateError }}</p>
      </label>
      <label class="field">
        <span>留存偏移（天）</span>
        <input v-model="offsetsText" type="text" placeholder="1,7,30" autocomplete="off" />
        <p v-if="offsetsError" class="field-error">{{ offsetsError }}</p>
        <p v-else class="field-hint">解析结果：{{ offsetsPreview.length ? offsetsPreview.join(', ') : '—' }}</p>
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
        <div class="quick-range" aria-label="快捷 cohort 范围">
          <button type="button" class="chip-btn" :disabled="loading" @click="setQuickCohort(7)">近 7 天</button>
          <button type="button" class="chip-btn" :disabled="loading" @click="setQuickCohort(14)">近 14 天</button>
          <button type="button" class="chip-btn" :disabled="loading" @click="setQuickCohort(30)">近 30 天</button>
        </div>
        <button type="submit" class="primary-btn" :disabled="!canSubmit">查询</button>
        <button type="button" class="ghost-btn" :disabled="loading" @click="resetFilters">重置</button>
      </div>
      <div class="filters-summary">
        <p class="field-hint">当前口径：{{ filterSummary }}</p>
      </div>
    </form>

    <div v-if="loading" class="loading-row" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true" />
      <span>正在加载留存数据...</span>
    </div>

    <div v-else-if="error" class="error-panel">
      <p class="error-text">{{ error }}</p>
      <button type="button" class="ghost-btn" @click="load">重试</button>
    </div>

    <div v-else-if="data" class="table-scroll">
      <table class="report-table">
        <thead>
          <tr>
            <th>Cohort 日期</th>
            <th>注册人数</th>
            <th v-for="n in sortedOffsets" :key="n">D+{{ n }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in data.rows" :key="row.cohortDay">
            <td>{{ row.cohortDay }}</td>
            <td>{{ row.cohortSize }}</td>
            <td v-for="n in sortedOffsets" :key="n">
              <span class="cell-strong">{{ (retainedAt(row, n).rate * 100).toFixed(1) }}%</span>
              <span class="cell-muted">({{ retainedAt(row, n).count }} 人)</span>
            </td>
          </tr>
        </tbody>
      </table>

      <p v-if="data.rows.length === 0" class="empty-hint">
        所选 cohort 范围内没有注册事件（auth_register）。可以放宽日期、检查 source/platform 过滤条件，或确认埋点是否正常写入。
      </p>

      <section v-if="data.rows.length" class="retention-trends">
        <h2 class="retention-trends__title">按偏移日查看各 cohort 走势</h2>
        <div v-for="n in sortedOffsets" :key="`t-${n}`" class="retention-trend-row">
          <div class="retention-trend-row__label">D+{{ n }}</div>
          <ul class="retention-trend-chips">
            <li v-for="row in data.rows" :key="`${row.cohortDay}-${n}`">
              <span class="chip-day">{{ row.cohortDay }}</span>
              <span class="chip-rate">{{ (retainedAt(row, n).rate * 100).toFixed(1) }}%</span>
            </li>
          </ul>
        </div>
      </section>

      <p class="small-print">统计范围 {{ data.cohortStart }} 到 {{ data.cohortEnd }}，偏移日为 {{ sortedOffsets.join(', ') }}。</p>
    </div>
  </section>
</template>
