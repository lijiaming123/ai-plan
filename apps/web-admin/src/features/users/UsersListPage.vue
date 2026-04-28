<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getAdminApiClient } from '../../lib/api-client';
import type { AdminUserListResponse } from '../../lib/api-client';
import { adminAuthState } from '../../stores/auth';

const route = useRoute();
const router = useRouter();

const q = ref('');
const page = ref(1);
const pageSize = ref(20);
const data = ref<AdminUserListResponse | null>(null);
const error = ref('');
const loading = ref(false);

const totalPages = computed(() => {
  if (!data.value) return 1;
  return Math.max(1, Math.ceil(data.value.total / data.value.pageSize));
});

const rangeText = computed(() => {
  if (!data.value || data.value.items.length === 0) return '当前没有命中任何用户。';
  const start = (data.value.page - 1) * data.value.pageSize + 1;
  const end = start + data.value.items.length - 1;
  return `当前显示第 ${start} 到 ${end} 条，共 ${data.value.total} 个用户标识。`;
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    data.value = await getAdminApiClient().getUsers(adminAuthState.token, {
      q: q.value.trim() || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
  } catch (err) {
    data.value = null;
    error.value = err instanceof Error ? err.message : '加载用户列表失败。';
  } finally {
    loading.value = false;
  }
}

function syncFromRoute() {
  q.value = typeof route.query.q === 'string' ? route.query.q : '';
  const p = typeof route.query.page === 'string' ? parseInt(route.query.page, 10) : NaN;
  const ps = typeof route.query.pageSize === 'string' ? parseInt(route.query.pageSize, 10) : NaN;
  page.value = Number.isFinite(p) && p > 0 ? p : 1;
  pageSize.value = Number.isFinite(ps) && ps > 0 && ps <= 100 ? ps : 20;
}

function applyFilters() {
  void router.replace({
    path: '/admin/users',
    query: {
      ...(q.value.trim() ? { q: q.value.trim() } : {}),
      ...(page.value > 1 ? { page: String(page.value) } : {}),
      ...(pageSize.value !== 20 ? { pageSize: String(pageSize.value) } : {}),
    },
  });
}

function submitSearch() {
  page.value = 1;
  applyFilters();
}

function resetFilters() {
  q.value = '';
  page.value = 1;
  pageSize.value = 20;
  applyFilters();
}

function goPage(nextPage: number) {
  page.value = nextPage;
  applyFilters();
}

watch(
  () => route.query,
  () => {
    syncFromRoute();
    void load();
  },
  { deep: true },
);

onMounted(() => {
  syncFromRoute();
  void load();
});
</script>

<template>
  <section class="page page--wide" :aria-busy="loading">
    <span class="badge">用户管理</span>
    <header class="section-stack">
      <h1 class="hero-title">业务用户列表</h1>
      <p class="hero-subtitle">
        展示在计划、提交或 telemetry 中出现过的业务 <code>userId</code>。这里不暴露登录邮箱等敏感账号字段，适合做排查与画像查看。
      </p>
    </header>

    <form class="filters" @submit.prevent="submitSearch">
      <label class="field field--grow">
        <span>搜索 userId</span>
        <input v-model="q" type="text" placeholder="支持片段匹配" autocomplete="off" />
      </label>
      <label class="field">
        <span>每页条数</span>
        <select v-model.number="pageSize" @change="submitSearch">
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>
      </label>
      <button type="submit" class="primary-btn" :disabled="loading">查询</button>
      <button type="button" class="ghost-btn" :disabled="loading" @click="resetFilters">重置</button>
    </form>

    <div class="stats-grid">
      <article class="stat-card">
        <span class="stat-label">总用户数</span>
        <strong class="stat-value">{{ data?.total ?? '--' }}</strong>
        <p class="stat-help">聚合自计划、任务提交与 telemetry 行为。</p>
      </article>
      <article class="stat-card">
        <span class="stat-label">当前页</span>
        <strong class="stat-value">{{ data?.page ?? page }}</strong>
        <p class="stat-help">共 {{ totalPages }} 页。</p>
      </article>
      <article class="stat-card">
        <span class="stat-label">页容量</span>
        <strong class="stat-value">{{ data?.pageSize ?? pageSize }}</strong>
        <p class="stat-help">支持 10 到 100 条一页。</p>
      </article>
      <article class="stat-card">
        <span class="stat-label">当前筛选</span>
        <strong class="stat-value stat-value--small">{{ q.trim() || '全部用户' }}</strong>
        <p class="stat-help">可按 userId 片段快速缩小范围。</p>
      </article>
    </div>

    <div class="info-panel">
      <p class="info-panel__title">列表说明</p>
      <p class="info-panel__body">{{ rangeText }}</p>
    </div>

    <div v-if="loading" class="loading-row" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true" />
      <span>正在加载用户列表...</span>
    </div>

    <div v-else-if="error" class="error-panel">
      <p class="error-text">{{ error }}</p>
      <button type="button" class="ghost-btn" @click="load">重试</button>
    </div>

    <div v-else-if="data" class="table-scroll">
      <table class="report-table">
        <thead>
          <tr>
            <th>#</th>
            <th>userId</th>
            <th>定位说明</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in data.items" :key="row.userId">
            <td>{{ (data.page - 1) * data.pageSize + index + 1 }}</td>
            <td class="mono cell-strong">{{ row.userId }}</td>
            <td>
              <span class="cell-muted">
                {{ q.trim() ? `命中关键字 “${q.trim()}”` : '来自业务行为聚合' }}
              </span>
            </td>
            <td class="actions">
              <router-link class="link-accent" :to="`/admin/users/${encodeURIComponent(row.userId)}`">
                查看详情
              </router-link>
            </td>
          </tr>
        </tbody>
      </table>

      <p v-if="data.items.length === 0" class="muted-text empty-hint">
        当前没有匹配的业务用户，可以调整搜索条件后重新查询。
      </p>

      <footer v-if="data.total > data.pageSize" class="pager">
        <span class="muted-text">{{ rangeText }}</span>
        <button type="button" class="ghost-btn" :disabled="data.page <= 1" @click="goPage(data.page - 1)">
          上一页
        </button>
        <button
          type="button"
          class="ghost-btn"
          :disabled="data.page >= totalPages"
          @click="goPage(data.page + 1)"
        >
          下一页
        </button>
      </footer>
    </div>
  </section>
</template>

<style scoped>
.actions {
  width: 6rem;
  white-space: nowrap;
}
</style>
