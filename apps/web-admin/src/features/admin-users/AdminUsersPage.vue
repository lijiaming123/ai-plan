<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  adminPresetMeta,
  getAdminRoleLabel,
  resolveAdminRolePreset,
} from '../../lib/admin-access';
import {
  getAdminApiClient,
  type AdminAccountRecord,
  type CreateAdminAccountInput,
} from '../../lib/api-client';
import { adminAuthState, adminProfile } from '../../stores/auth';
import { showToast } from '../../stores/toast';

const rows = ref<AdminAccountRecord[]>([]);
const loading = ref(false);
const error = ref('');

const showCreate = ref(false);
const createLoginId = ref('');
const createEmail = ref('');
const createPassword = ref('');
const createPreset = ref<CreateAdminAccountInput['presetKey']>('analyst');
const creating = ref(false);

const resetTarget = ref<AdminAccountRecord | null>(null);
const resetPassword = ref('');
const resetting = ref(false);

const presetOptions = adminPresetMeta.filter((p) => p.key !== 'super-admin');

function roleLabelFor(account: AdminAccountRecord) {
  return getAdminRoleLabel(account.permissions);
}

function presetFor(account: AdminAccountRecord) {
  return resolveAdminRolePreset(account.permissions);
}

const isSelf = (account: AdminAccountRecord) => account.id === adminProfile.userId;

async function load() {
  loading.value = true;
  error.value = '';
  try {
    rows.value = await getAdminApiClient().listAdminAccounts(adminAuthState.token);
  } catch (e) {
    rows.value = [];
    error.value = e instanceof Error ? e.message : '加载管理员列表失败。';
  } finally {
    loading.value = false;
  }
}

async function submitCreate() {
  creating.value = true;
  try {
    await getAdminApiClient().createAdminAccount(adminAuthState.token, {
      loginId: createLoginId.value.trim(),
      email: createEmail.value.trim() || null,
      password: createPassword.value,
      presetKey: createPreset.value,
    });
    showToast('管理员账号已创建', 'success');
    showCreate.value = false;
    createLoginId.value = '';
    createEmail.value = '';
    createPassword.value = '';
    createPreset.value = 'analyst';
    await load();
  } catch (e) {
    showToast(e instanceof Error ? e.message : '创建失败', 'error');
  } finally {
    creating.value = false;
  }
}

async function toggleDisabled(account: AdminAccountRecord) {
  if (isSelf(account) && !account.disabledAt) {
    showToast('不能禁用当前登录账号', 'error');
    return;
  }
  const disabled = !account.disabledAt;
  const label = disabled ? '禁用' : '启用';
  if (!window.confirm(`确认${label}账号 ${account.loginId}？`)) return;
  try {
    await getAdminApiClient().updateAdminAccount(adminAuthState.token, account.id, { disabled });
    showToast(`已${label} ${account.loginId}`, 'success');
    await load();
  } catch (e) {
    showToast(e instanceof Error ? e.message : `${label}失败`, 'error');
  }
}

async function changePreset(account: AdminAccountRecord, presetKey: CreateAdminAccountInput['presetKey']) {
  if (!presetKey) return;
  try {
    await getAdminApiClient().updateAdminAccount(adminAuthState.token, account.id, { presetKey });
    showToast(`已更新 ${account.loginId} 的角色包`, 'success');
    await load();
  } catch (e) {
    showToast(e instanceof Error ? e.message : '更新失败', 'error');
  }
}

async function submitReset() {
  if (!resetTarget.value) return;
  resetting.value = true;
  try {
    await getAdminApiClient().resetAdminAccountPassword(
      adminAuthState.token,
      resetTarget.value.id,
      resetPassword.value,
    );
    showToast(`已重置 ${resetTarget.value.loginId} 的密码`, 'success');
    resetTarget.value = null;
    resetPassword.value = '';
  } catch (e) {
    showToast(e instanceof Error ? e.message : '重置失败', 'error');
  } finally {
    resetting.value = false;
  }
}

const canCreate = computed(
  () =>
    createLoginId.value.trim().length >= 2 &&
    createPassword.value.length >= 8 &&
    !creating.value,
);

onMounted(() => void load());
</script>

<template>
  <section class="page page--wide" :aria-busy="loading">
    <span class="badge">账号治理</span>
    <header class="section-stack">
      <h1 class="hero-title">管理员账号</h1>
      <p class="hero-subtitle">创建后台账号、分配角色包、禁用或重置密码。所有写操作均会写入审计日志。</p>
    </header>

    <div class="detail-head">
      <button type="button" class="primary-btn" @click="showCreate = !showCreate">
        {{ showCreate ? '收起创建表单' : '创建账号' }}
      </button>
      <button type="button" class="ghost-btn" :disabled="loading" @click="load">刷新</button>
    </div>

    <section v-if="showCreate" class="detail-card">
      <h2 class="detail-card__title">新建管理员</h2>
      <form class="filters" @submit.prevent="submitCreate">
        <label class="field">
          <span>登录 ID</span>
          <input v-model="createLoginId" type="text" required autocomplete="off" placeholder="如 ops1" />
        </label>
        <label class="field">
          <span>邮箱（可选）</span>
          <input v-model="createEmail" type="email" autocomplete="off" placeholder="ops@company.com" />
        </label>
        <label class="field">
          <span>初始密码</span>
          <input v-model="createPassword" type="password" minlength="8" required autocomplete="new-password" />
        </label>
        <label class="field">
          <span>角色包</span>
          <select v-model="createPreset">
            <option v-for="p in presetOptions" :key="p.key" :value="p.key">{{ p.label }}</option>
          </select>
        </label>
        <div class="filters-actions">
          <button type="submit" class="primary-btn" :disabled="!canCreate">创建</button>
        </div>
      </form>
    </section>

    <div v-if="loading" class="loading-row" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true" />
      <span>正在加载管理员列表...</span>
    </div>

    <div v-else-if="error" class="error-panel">
      <p class="error-text">{{ error }}</p>
      <button type="button" class="ghost-btn" @click="load">重试</button>
    </div>

    <section v-else class="detail-card">
      <div class="table-scroll">
        <table class="report-table">
          <thead>
            <tr>
              <th>登录 ID</th>
              <th>邮箱</th>
              <th>角色</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td class="mono">{{ row.loginId }}</td>
              <td class="mono">{{ row.email || '—' }}</td>
              <td>
                <span class="status-pill status-pill--muted">{{ roleLabelFor(row) }}</span>
                <select
                  class="preset-select"
                  :value="presetFor(row)"
                  @change="changePreset(row, ($event.target as HTMLSelectElement).value as any)"
                >
                  <option v-for="p in presetOptions" :key="p.key" :value="p.key">{{ p.label }}</option>
                  <option v-if="presetFor(row) === 'custom'" value="custom" disabled>自定义</option>
                </select>
              </td>
              <td>
                <span
                  class="status-pill"
                  :class="row.disabledAt ? 'pill-warn' : 'status-pill--ok'"
                >
                  {{ row.disabledAt ? '已禁用' : '正常' }}
                </span>
              </td>
              <td class="actions-cell">
                <button type="button" class="ghost-btn" :disabled="isSelf(row) && !row.disabledAt" @click="toggleDisabled(row)">
                  {{ row.disabledAt ? '启用' : '禁用' }}
                </button>
                <button type="button" class="ghost-btn" @click="resetTarget = row">重置密码</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="rows.length === 0" class="empty-hint">暂无管理员账号。</p>
    </section>

    <dialog v-if="resetTarget" open class="modal-dialog">
      <form class="detail-card modal-card" @submit.prevent="submitReset">
        <h2 class="detail-card__title">重置密码 — {{ resetTarget.loginId }}</h2>
        <label class="field">
          <span>新密码</span>
          <input v-model="resetPassword" type="password" minlength="8" required autocomplete="new-password" />
        </label>
        <div class="filters-actions">
          <button type="submit" class="primary-btn" :disabled="resetting || resetPassword.length < 8">确认</button>
          <button type="button" class="ghost-btn" @click="resetTarget = null">取消</button>
        </div>
      </form>
    </dialog>
  </section>
</template>

<style scoped>
.detail-head {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.preset-select {
  display: block;
  margin-top: 0.35rem;
  max-width: 10rem;
  font-size: 0.82rem;
}

.actions-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.modal-dialog {
  border: none;
  padding: 0;
  background: transparent;
  max-width: min(420px, 92vw);
  margin: auto;
}

.modal-dialog::backdrop {
  background: rgba(15, 23, 42, 0.45);
}

.modal-card {
  margin: 0;
}
</style>
