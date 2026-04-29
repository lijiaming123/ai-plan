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

const sortedOffsets = computed(() => {
  if (!data.value) return [];
  return [...data.value.offsets].sort((a, b) => a - b);
});

async function load() {
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
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 30);
  cohortEnd.value = toYmd(end);
  cohortStart.value = toYmd(start);
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
      </label>
      <label class="field">
        <span>Cohort 结束日期 (UTC)</span>
        <input v-model="cohortEnd" type="date" required />
      </label>
      <label class="field">
        <span>留存偏移（天）</span>
        <input v-model="offsetsText" type="text" placeholder="1,7,30" autocomplete="off" />
      </label>
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
      <button type="submit" class="primary-btn" :disabled="loading">查询</button>
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
