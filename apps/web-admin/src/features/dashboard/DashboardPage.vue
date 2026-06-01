<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  getAdminApiClient,
  type AdminAuditLogRecord,
  type AdminDashboardSummary,
  type AdminRuleRecord,
} from '../../lib/api-client';
import { adminAuthState, adminProfile } from '../../stores/auth';
import { resolveAdminRolePreset } from '../../lib/admin-access';
import CopyButton from '../../components/CopyButton.vue';

const summary = ref<AdminDashboardSummary | null>(null);
const auditRows = ref<AdminAuditLogRecord[]>([]);
const rules = ref<AdminRuleRecord[]>([]);
const error = ref('');
const loading = ref(true);
const updatedAt = ref<Date | null>(null);
const auditError = ref('');
const rulesError = ref('');
const auditLoading = ref(false);
const rulesLoading = ref(false);

const isSuperAdmin = computed(() => adminProfile.permissions.includes('rbac:manage'));
const isAnalystView = computed(
  () =>
    !isSuperAdmin.value &&
    adminProfile.permissions.includes('analytics:read') &&
    resolveAdminRolePreset(adminProfile.permissions) !== 'auditor',
);
const canReadAudit = computed(() => adminProfile.permissions.includes('audit:read'));

const completionRate = computed(() => {
  if (!summary.value || summary.value.submissionCount === 0) return '0%';
  return `${((summary.value.completedCount / summary.value.submissionCount) * 100).toFixed(1)}%`;
});

const retryRate = computed(() => {
  if (!summary.value || summary.value.submissionCount === 0) return '0.0%';
  return `${((summary.value.retryCount / summary.value.submissionCount) * 100).toFixed(1)}%`;
});

const recentRetry = computed(() => {
  if (!summary.value) return [];
  return summary.value.recentSubmissions.filter((s) => s.status === 'needs_retry');
});

const enabledRuleCount = computed(() => rules.value.filter((r) => r.enabled).length);
const disabledRuleCount = computed(() => Math.max(0, rules.value.length - enabledRuleCount.value));

function submissionStatusLabel(status: string) {
  if (status === 'completed') return '已完成';
  if (status === 'needs_retry') return '待重提';
  if (status === 'in_review') return '审核中';
  return status;
}

function submissionStatusClass(status: string) {
  if (status === 'completed') return 'status-pill--ok';
  if (status === 'needs_retry') return 'pill-warn';
  return 'status-pill--muted';
}

function auditSummaryText(row: AdminAuditLogRecord) {
  const raw = typeof row.summary === 'string' ? row.summary.trim() : '';
  return raw ? raw : '—';
}

function isHighRiskAuditAction(action: string) {
  const a = String(action || '').toLowerCase();
  return (
    a.includes('rbac') ||
    a.includes('permission') ||
    a.includes('export') ||
    a.includes('rule') ||
    a.includes('delete') ||
    a.includes('disable') ||
    a.includes('enable')
  );
}

const highRiskAudits = computed(() => auditRows.value.filter((r) => isHighRiskAuditAction(r.action)).slice(0, 6));

async function load() {
  loading.value = true;
  error.value = '';
  auditError.value = '';
  rulesError.value = '';
  try {
    const api = getAdminApiClient();
    summary.value = await api.getDashboard(adminAuthState.token);
    updatedAt.value = new Date();

    // 次要模块：失败不阻塞总览
    if (canReadAudit.value) {
      auditLoading.value = true;
      void api
        .getAuditLogs(adminAuthState.token, { limit: 24 })
        .then((rows) => {
          auditRows.value = rows;
        })
        .catch((e) => {
          auditRows.value = [];
          auditError.value = e instanceof Error ? e.message : '加载审计摘要失败。';
        })
        .finally(() => {
          auditLoading.value = false;
        });
    } else {
      auditRows.value = [];
    }

    if (isSuperAdmin.value) {
      rulesLoading.value = true;
      void api
        .getRules(adminAuthState.token)
        .then((rows) => {
          rules.value = rows;
        })
        .catch((e) => {
          rules.value = [];
          rulesError.value = e instanceof Error ? e.message : '加载规则概览失败。';
        })
        .finally(() => {
          rulesLoading.value = false;
        });
    } else {
      rules.value = [];
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载总览失败。';
  } finally {
    loading.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <section class="page page--wide" :aria-busy="loading">
    <span class="badge">运营总览</span>
    <header class="section-stack">
      <h1 class="hero-title">控制台总览</h1>
      <p class="hero-subtitle">集中查看计划推进、提交处理和规则运行状态，先看关键指标，再进入具体模块。</p>
    </header>

    <div v-if="loading" class="loading-row" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true" />
      <span>正在加载总览数据...</span>
    </div>

    <div v-else-if="error" class="error-panel">
      <p class="error-text">{{ error }}</p>
      <button type="button" class="ghost-btn" @click="load">重新加载</button>
    </div>

    <template v-else-if="summary">
      <section v-if="isSuperAdmin" class="detail-card">
        <div class="detail-head">
          <h2 class="detail-card__title">值班台（超级管理员）</h2>
          <span v-if="updatedAt" class="small-print">更新于 {{ updatedAt.toLocaleString('zh-CN', { hour12: false }) }}</span>
        </div>
        <div class="chip-row">
          <router-link class="primary-btn link-btn" to="/admin/submissions">去处理异常提交</router-link>
          <router-link class="ghost-btn link-btn" to="/admin/rules">检查规则中心</router-link>
          <router-link v-if="canReadAudit" class="ghost-btn link-btn" to="/admin/audit-logs">查看审计日志</router-link>
          <router-link class="ghost-btn link-btn" to="/admin/access">权限矩阵</router-link>
          <router-link class="ghost-btn link-btn" to="/admin/admin-users">管理员账号</router-link>
        </div>
        <p class="small-print">优先处理 “待重提/异常流转”，其次确认规则与权限变更是否符合预期。</p>
      </section>

      <section v-else-if="isAnalystView" class="detail-card">
        <div class="detail-head">
          <h2 class="detail-card__title">增长摘要（运营分析）</h2>
          <span v-if="updatedAt" class="small-print">更新于 {{ updatedAt.toLocaleString('zh-CN', { hour12: false }) }}</span>
        </div>
        <div class="chip-row">
          <router-link class="primary-btn link-btn" to="/admin/analytics/funnel">漏斗分析</router-link>
          <router-link class="ghost-btn link-btn" to="/admin/analytics/retention">留存分析</router-link>
          <router-link class="ghost-btn link-btn" to="/admin/analytics/path">路径分析</router-link>
          <router-link class="ghost-btn link-btn" to="/admin/users">用户画像</router-link>
        </div>
        <p class="small-print">先看转化与留存趋势，再下钻到具体用户排查异常 cohort。</p>
      </section>

      <div class="stats-grid">
        <article class="stat-card">
          <span class="stat-label">计划数</span>
          <strong class="stat-value">{{ summary.planCount }}</strong>
          <p class="stat-help">当前累计生成的计划数量。</p>
        </article>
        <article class="stat-card">
          <span class="stat-label">提交数</span>
          <strong class="stat-value">{{ summary.submissionCount }}</strong>
          <p class="stat-help">任务与打卡提交总量。</p>
        </article>
        <article class="stat-card">
          <span class="stat-label">规则数</span>
          <strong class="stat-value">{{ summary.ruleCount }}</strong>
          <p class="stat-help">当前生效的规则配置条目。</p>
        </article>
        <article class="stat-card">
          <span class="stat-label">完成率</span>
          <strong class="stat-value">{{ completionRate }}</strong>
          <p class="stat-help">按提交总数计算的完成占比。</p>
        </article>
      </div>

      <div class="detail-grid detail-grid--columns">
        <section class="detail-card">
          <h2 class="detail-card__title">处理状态</h2>
          <ul class="stat-list">
            <li><span>已完成</span> <strong>{{ summary.completedCount }}</strong></li>
            <li><span>待重提</span> <strong>{{ summary.retryCount }}</strong></li>
            <li><span>总提交</span> <strong>{{ summary.submissionCount }}</strong></li>
          </ul>
          <p class="small-print">待重提占比 {{ retryRate }}。</p>
        </section>

        <section class="detail-card">
          <h2 class="detail-card__title">观察建议</h2>
          <div class="chip-row">
            <span class="status-pill status-pill--ok">先看总量</span>
            <span class="status-pill status-pill--muted">再看异常流转</span>
          </div>
          <p class="small-print">
            如果待重提数量明显升高，优先检查规则中心和最新提交流水，再回到用户画像页排查集中异常用户。
          </p>
        </section>
      </div>

      <div v-if="isSuperAdmin" class="detail-grid detail-grid--columns">
        <section class="detail-card">
          <div class="detail-head">
            <h2 class="detail-card__title">异常聚焦</h2>
            <router-link class="link-accent" to="/admin/submissions">打开提交审计</router-link>
          </div>
          <div class="chip-row">
            <span class="status-pill pill-warn">待重提 {{ summary.retryCount }}</span>
            <span class="status-pill status-pill--muted">最近 20 条里待重提 {{ recentRetry.length }}</span>
          </div>
          <p v-if="recentRetry.length === 0" class="small-print">最近提交未出现待重提状态，当前流转较稳定。</p>
          <ul v-else class="list">
            <li v-for="r in recentRetry.slice(0, 6)" :key="r.id" class="list-item">
              <div class="item-top">
                <span class="pill pill-warn status-pill">待重提</span>
                <span class="cell-muted mono">{{ r.taskId }}</span>
              </div>
              <div class="item-key mono">{{ r.userId }}</div>
              <p class="item-desc">{{ r.content || '—' }}</p>
            </li>
          </ul>
        </section>

        <section class="detail-card">
          <div class="detail-head">
            <h2 class="detail-card__title">规则概览</h2>
            <router-link class="link-accent" to="/admin/rules">打开规则中心</router-link>
          </div>
          <div v-if="rulesLoading" class="loading-row" aria-live="polite">
            <span class="loading-spinner" aria-hidden="true" />
            <span>正在加载规则概览...</span>
          </div>
          <div v-else-if="rulesError" class="error-panel">
            <p class="error-text">{{ rulesError }}</p>
            <button type="button" class="ghost-btn" @click="load">重试</button>
          </div>
          <div class="stats-grid stats-grid--tight">
            <article class="stat-card">
              <span class="stat-label">启用中</span>
              <strong class="stat-value">{{ enabledRuleCount }}</strong>
              <p class="stat-help">已参与判定流程。</p>
            </article>
            <article class="stat-card">
              <span class="stat-label">已关闭</span>
              <strong class="stat-value">{{ disabledRuleCount }}</strong>
              <p class="stat-help">当前关闭或未启用。</p>
            </article>
          </div>
          <p class="small-print">如待重提升高，优先确认是否有规则值更新或策略误配置。</p>
        </section>
      </div>

      <section class="detail-card">
        <div class="detail-head">
          <h2 class="detail-card__title">最近提交</h2>
          <span v-if="updatedAt" class="small-print">更新于 {{ updatedAt.toLocaleString('zh-CN', { hour12: false }) }}</span>
        </div>
        <div class="table-scroll">
          <table class="mini-table">
            <thead>
              <tr>
                <th>提交 ID</th>
                <th>用户</th>
                <th>任务</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in summary.recentSubmissions" :key="item.id">
                <td class="mono">
                  <span class="mono-truncate">{{ item.id }}</span>
                  <CopyButton :value="item.id" label="复制提交 ID" />
                </td>
                <td class="mono">
                  <span class="mono-truncate">{{ item.userId }}</span>
                  <CopyButton :value="item.userId" label="复制用户 ID" />
                </td>
                <td class="mono">
                  <span class="mono-truncate">{{ item.taskId }}</span>
                  <CopyButton :value="item.taskId" label="复制任务 ID" />
                </td>
                <td>
                  <span class="status-pill" :class="submissionStatusClass(item.status)">
                    {{ submissionStatusLabel(item.status) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="summary.recentSubmissions.length === 0" class="small-print">当前没有最近提交记录。</p>
      </section>

      <section v-if="adminProfile.permissions.includes('audit:read')" class="detail-card">
        <div class="detail-head">
          <h2 class="detail-card__title">最近审计动态</h2>
          <router-link class="link-accent" to="/admin/audit-logs">打开审计日志</router-link>
        </div>
        <div v-if="auditLoading" class="loading-row" aria-live="polite">
          <span class="loading-spinner" aria-hidden="true" />
          <span>正在加载审计摘要...</span>
        </div>
        <div v-else-if="auditError" class="error-panel">
          <p class="error-text">{{ auditError }}</p>
          <button type="button" class="ghost-btn" @click="load">重试</button>
        </div>
        <div v-if="isSuperAdmin" class="chip-row">
          <span class="status-pill status-pill--muted">最近 {{ auditRows.length }} 条</span>
          <span class="status-pill pill-warn">疑似高风险 {{ highRiskAudits.length }}</span>
        </div>
        <p v-if="isSuperAdmin && highRiskAudits.length" class="small-print">
          已按动作关键字（rbac/permission/export/rule 等）做快速筛选，建议逐条确认变更是否符合预期。
        </p>
        <p v-if="auditRows.length === 0" class="small-print">当前没有审计记录，或暂未加载到数据。</p>
        <ul v-else-if="isSuperAdmin && highRiskAudits.length" class="list">
          <li v-for="r in highRiskAudits" :key="r.id" class="list-item">
            <div class="item-top">
              <span class="pill pill-warn status-pill">{{ r.action }}</span>
              <span class="cell-muted">{{ new Date(r.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</span>
            </div>
            <div class="item-key mono">{{ r.actorEmail }}</div>
            <p class="item-desc">{{ auditSummaryText(r) }}</p>
          </li>
        </ul>
        <ul v-else class="list">
          <li v-for="r in auditRows" :key="r.id" class="list-item">
            <div class="item-top">
              <span class="pill status-pill status-pill--muted">{{ r.action }}</span>
              <span class="cell-muted">{{ new Date(r.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</span>
            </div>
            <div class="item-key mono">{{ r.actorEmail }}</div>
            <p class="item-desc">{{ auditSummaryText(r) }}</p>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<style scoped>
.detail-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 0.65rem;
}

.stats-grid--tight {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}
</style>
