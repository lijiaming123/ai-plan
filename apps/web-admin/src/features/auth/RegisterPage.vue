<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AdminAuthLayout from './AdminAuthLayout.vue';
import { getAdminApiClient } from '../../lib/api-client';
import { clearAdminToken, hydrateAdminProfile, setAdminToken } from '../../stores/auth';

const router = useRouter();

const email = ref('');
const password = ref('');
const showPassword = ref(false);
const preset = ref<'analyst' | 'auditor'>('analyst');
const submitting = ref(false);
const error = ref('');
const errorSummaryRef = ref<HTMLElement | null>(null);

const passwordOk = computed(() => password.value.length >= 8);

watch(error, async (msg) => {
  if (!msg) return;
  await nextTick();
  errorSummaryRef.value?.focus();
});

async function submit() {
  error.value = '';
  if (!passwordOk.value) {
    error.value = '密码至少需要 8 个字符。';
    return;
  }
  submitting.value = true;
  try {
    const { token } = await getAdminApiClient().registerAdmin({
      email: email.value.trim(),
      password: password.value,
      preset: preset.value,
    });
    setAdminToken(token);
    const ok = await hydrateAdminProfile();
    if (!ok) {
      clearAdminToken();
      error.value = '账号已创建，但无法完成登录校验。请返回登录页重试。';
      return;
    }
    await router.replace('/admin/dashboard');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '注册失败';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <AdminAuthLayout>
    <a class="auth-skip-form" href="#auth-form-start">跳到表单</a>
    <h2 id="auth-form-start" class="auth-card__title" tabindex="-1">注册管理员</h2>
    <p id="reg-subtitle" class="auth-card__subtitle">
      演示环境专用：需服务端开启
      <code class="auth-inline-code">ADMIN_OPEN_REGISTER=true</code>。账号写入数据库（需已执行迁移）；与种子超级管理员无关。
    </p>

    <div
      v-if="error"
      ref="errorSummaryRef"
      class="auth-error"
      tabindex="-1"
      role="alert"
      aria-live="assertive"
    >
      {{ error }}
    </div>

    <form :aria-busy="submitting" aria-describedby="reg-subtitle" novalidate @submit.prevent="submit">
      <div class="auth-field">
        <label for="reg-email">邮箱</label>
        <input
          id="reg-email"
          v-model="email"
          type="email"
          name="email"
          autocomplete="username"
          placeholder="you@company.com"
          required
          :aria-invalid="error ? 'true' : undefined"
        />
      </div>
      <div class="auth-field">
        <label for="reg-password">密码</label>
        <div class="auth-password-row">
          <input
            id="reg-password"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            name="password"
            autocomplete="new-password"
            minlength="8"
            required
            aria-describedby="pwd-hint"
            :aria-invalid="!passwordOk && password.length > 0 ? 'true' : undefined"
          />
          <button
            type="button"
            class="auth-password-toggle"
            :aria-pressed="showPassword"
            :aria-label="showPassword ? '隐藏密码' : '显示密码'"
            @click="showPassword = !showPassword"
          >
            {{ showPassword ? '隐藏' : '显示' }}
          </button>
        </div>
        <p id="pwd-hint" class="auth-field-hint" :class="{ 'auth-field-hint--ok': passwordOk && password.length > 0 }">
          {{ passwordOk ? '已满足最少 8 位' : '至少 8 位字符' }}
        </p>
      </div>

      <div class="auth-field">
        <span id="preset-label" class="auth-preset-legend">权限角色</span>
        <div class="auth-preset-grid" role="radiogroup" aria-labelledby="preset-label">
          <label class="auth-preset" :class="{ 'auth-preset--active': preset === 'analyst' }">
            <input v-model="preset" type="radio" name="preset" value="analyst" />
            <div>
              <strong>运营分析</strong>
              <span>报表与漏斗 / 留存 / 路径，以及用户列表（只读分析向）。</span>
            </div>
          </label>
          <label class="auth-preset" :class="{ 'auth-preset--active': preset === 'auditor' }">
            <input v-model="preset" type="radio" name="preset" value="auditor" />
            <div>
              <strong>审计只读</strong>
              <span>审计日志与只读分析，适合合规查看。</span>
            </div>
          </label>
        </div>
      </div>

      <button type="submit" class="auth-submit" :disabled="submitting">
        <span v-if="submitting" class="auth-submit__spinner" aria-hidden="true" />
        {{ submitting ? '创建中…' : '创建并登录' }}
      </button>
    </form>

    <p class="auth-foot">
      已有账号？
      <router-link to="/admin/login">返回登录</router-link>
    </p>
  </AdminAuthLayout>
</template>
