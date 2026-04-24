<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getAdminApiClient, type AdminFunnelResponse } from '../../lib/api-client';
import { adminAuthState } from '../../stores/auth';

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

async function load() {
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
    error.value = err instanceof Error ? err.message : '加载失败';
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
    <header>
      <h1 class="hero-title">漏斗分析</h1>
      <p class="hero-subtitle">预置：注册 → 创建计划 → 发布 → 打卡（基于 Telemetry 事件，仅统计已登录 userId）。</p>
    </header>

    <form class="filters" @submit.prevent="load">
      <label class="field">
        <span>开始日 (UTC)</span>
        <input v-model="startDate" type="date" required />
      </label>
      <label class="field">
        <span>结束日 (UTC)</span>
        <input v-model="endDate" type="date" required />
      </label>
      <label class="field">
        <span>转化窗口（天）</span>
        <input v-model.number="windowDays" type="number" min="1" max="365" />
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
      <span>正在加载漏斗数据…</span>
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
            <th>上一步转化率</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in data.steps" :key="idx">
            <td>{{ row.step }}</td>
            <td>{{ row.count }}</td>
            <td>
              {{
                row.conversionFromPrev == null
                  ? '—'
                  : `${(row.conversionFromPrev * 100).toFixed(1)}%`
              }}
            </td>
          </tr>
        </tbody>
      </table>
      <p class="muted-text small-print">
        窗口 {{ data.windowDays }} 天 · 范围 {{ data.start }} — {{ data.end }}
      </p>
    </div>
  </section>
</template>
