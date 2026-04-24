<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
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

async function load() {
  loading.value = true;
  error.value = '';
  data.value = null;
  try {
    data.value = await getAdminApiClient().getUsers(adminAuthState.token, {
      q: q.value.trim() || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

function syncFromRoute() {
  q.value = typeof route.query.q === 'string' ? route.query.q : '';
  const p = typeof route.query.page === 'string' ? parseInt(route.query.page, 10) : NaN;
  page.value = Number.isFinite(p) && p > 0 ? p : 1;
}

function applyFilters() {
  void router.replace({
    path: '/admin/users',
    query: {
      ...(q.value.trim() ? { q: q.value.trim() } : {}),
      ...(page.value > 1 ? { page: String(page.value) } : {}),
    },
  });
}

function submitSearch() {
  page.value = 1;
  applyFilters();
}

function goPage(p: number) {
  page.value = p;
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
  <section class="page page--narrow" :aria-busy="loading">
    <span class="badge">用户</span>
    <header>
      <h1 class="hero-title">用户列表</h1>
      <p class="hero-subtitle">
        展示在计划、任务提交或 Telemetry 中出现过的业务 <code>userId</code>。不包含登录邮箱等敏感字段；如需与账号体系关联请走专用治理流程。
      </p>
    </header>

    <form class="filters" @submit.prevent="submitSearch">
      <label class="field field--grow">
        <span>搜索 userId</span>
        <input v-model="q" type="text" placeholder="支持片段匹配" autocomplete="off" />
      </label>
      <label class="field">
        <span>每页条数</span>
        <input v-model.number="pageSize" type="number" min="1" max="100" @change="submitSearch" />
      </label>
      <button type="submit" class="primary-btn" :disabled="loading">查询</button>
    </form>

    <div v-if="loading" class="loading-row" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true" />
      <span>正在加载用户列表…</span>
    </div>

    <div v-else-if="error" class="error-panel">
      <p class="error-text">{{ error }}</p>
      <button type="button" class="ghost-btn" @click="load">重试</button>
    </div>

    <div v-else-if="data" class="table-scroll">
      <table class="report-table">
        <thead>
          <tr>
            <th>userId</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in data.items" :key="row.userId">
            <td class="mono">{{ row.userId }}</td>
            <td class="actions">
              <router-link class="link-accent" :to="`/admin/users/${encodeURIComponent(row.userId)}`">
                详情
              </router-link>
            </td>
          </tr>
        </tbody>
      </table>

      <p v-if="data.items.length === 0" class="muted-text empty-hint">暂无数据，可调整搜索条件。</p>

      <footer v-if="data.total > data.pageSize" class="pager">
        <span class="muted-text">共 {{ data.total }} 条 · 第 {{ data.page }} 页</span>
        <button type="button" class="ghost-btn" :disabled="data.page <= 1" @click="goPage(data.page - 1)">
          上一页
        </button>
        <button
          type="button"
          class="ghost-btn"
          :disabled="data.page * data.pageSize >= data.total"
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
  width: 4.5rem;
  white-space: nowrap;
}
</style>
