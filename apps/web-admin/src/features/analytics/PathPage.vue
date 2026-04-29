<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getAdminApiClient } from '../../lib/api-client';
import type { AdminPathResponse } from '../../lib/api-client';
import { adminAuthState } from '../../stores/auth';

const START_EVENT_OPTIONS = [
  { value: 'dashboard_view', label: 'dashboard_view（默认）' },
  { value: 'auth_register', label: 'auth_register' },
  { value: 'auth_login', label: 'auth_login' },
  { value: 'plan_create', label: 'plan_create' },
  { value: 'plan_publish', label: 'plan_publish' },
  { value: 'checkin_submit', label: 'checkin_submit' },
] as const;

function toYmd(d: Date) {
  return d.toISOString().slice(0, 10);
}

const endDate = ref('');
const startDate = ref('');
const startEvent = ref<string>('dashboard_view');
const pathLength = ref(4);
const topN = ref(20);
const source = ref('');
const platform = ref('');
const clientVersion = ref('');

const data = ref<AdminPathResponse | null>(null);
const error = ref('');
const loading = ref(false);

const emptyHint = computed(() => {
  if (!data.value || data.value.totalPaths > 0) return '';
  return '所选范围内没有可统计的完整路径，需要从起点事件连续满足路径长度。没有 sessionId 时会按 30 分钟静默间隔切分会话。';
});

async function load() {
  loading.value = true;
  error.value = '';
  data.value = null;
  try {
    data.value = await getAdminApiClient().getPath(adminAuthState.token, {
      start: startDate.value,
      end: endDate.value,
      startEvent: startEvent.value.trim() || undefined,
      pathLength: pathLength.value,
      top: topN.value,
      source: source.value.trim() || undefined,
      platform: platform.value.trim() || undefined,
      clientVersion: clientVersion.value.trim() || undefined,
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载路径数据失败。';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);
  endDate.value = toYmd(end);
  startDate.value = toYmd(start);
  void load();
});
</script>

<template>
  <section class="page page--narrow" :aria-busy="loading">
    <span class="badge">增长分析</span>
    <header class="section-stack">
      <h1 class="hero-title">路径分析</h1>
      <p class="hero-subtitle">
        以起点事件为锚点抽取连续行为序列，查看最常见的用户行为路径和占比，适合判断真实使用流向。
      </p>
    </header>

    <form class="filters" @submit.prevent="load">
      <label class="field">
        <span>开始日期 (UTC)</span>
        <input v-model="startDate" type="date" required />
      </label>
      <label class="field">
        <span>结束日期 (UTC)</span>
        <input v-model="endDate" type="date" required />
      </label>
      <label class="field">
        <span>起点事件</span>
        <select v-model="startEvent" class="select-input">
          <option v-for="opt in START_EVENT_OPTIONS" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>路径长度</span>
        <input v-model.number="pathLength" type="number" min="3" max="6" required />
      </label>
      <label class="field">
        <span>Top N</span>
        <input v-model.number="topN" type="number" min="1" max="100" required />
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
      <span>正在加载路径数据...</span>
    </div>

    <div v-else-if="error" class="error-panel">
      <p class="error-text">{{ error }}</p>
      <button type="button" class="ghost-btn" @click="load">重试</button>
    </div>

    <div v-else-if="data" class="table-scroll">
      <p v-if="emptyHint" class="empty-hint">{{ emptyHint }}</p>

      <table v-else class="report-table">
        <thead>
          <tr>
            <th>路径</th>
            <th>次数</th>
            <th>占比</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in data.paths" :key="idx">
            <td class="mono">{{ row.path }}</td>
            <td>{{ row.count }}</td>
            <td>{{ (row.share * 100).toFixed(1) }}%</td>
          </tr>
        </tbody>
      </table>

      <p class="small-print">
        会话数 {{ data.streamCount }}，有效路径 {{ data.totalPaths }}，切分间隔 {{ data.sessionGapMinutes }} 分钟，统计范围 {{ data.start }} 到 {{ data.end }}。
      </p>
    </div>
  </section>
</template>
