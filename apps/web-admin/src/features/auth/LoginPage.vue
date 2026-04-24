<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AdminAuthLayout from './AdminAuthLayout.vue';
import { getAdminApiClient } from '../../lib/api-client';
import { clearAdminToken, hydrateAdminProfile, setAdminToken } from '../../stores/auth';

const route = useRoute();
const router = useRouter();

const email = ref('');
const password = ref('');
const showPassword = ref(false);
const submitting = ref(false);
const error = ref('');
const errorSummaryRef = ref<HTMLElement | null>(null);

watch(error, async (msg) => {
  if (!msg) return;
  await nextTick();
  errorSummaryRef.value?.focus();
});

async function submit() {
  error.value = '';
  submitting.value = true;
  try {
    const { token } = await getAdminApiClient().login({
      email: email.value.trim(),
      password: password.value,
    });
    setAdminToken(token);
    const ok = await hydrateAdminProfile();
    if (!ok) {
      clearAdminToken();
      error.value = '该账号不是管理员，或会话校验失败。请使用管理员账号或邮箱登录。';
      return;
    }
    const redir = route.query.redirect;
    await router.replace(typeof redir === 'string' ? redir : '/admin/dashboard');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <AdminAuthLayout>
    <a class="auth-skip-form" href="#auth-form-start">跳到表单</a>
    <h2 id="auth-form-start" class="auth-card__title" tabindex="-1">登录</h2>
    <p id="login-subtitle" class="auth-card__subtitle">
      使用已开通的管理员邮箱与密码进入控制台。
    </p>

    <details class="auth-demo-hint">
      <summary>本地演示账号提示</summary>
      <p>例如 <code>admin@ai-plan.dev</code>（密码见仓库 README / 团队文档）。普通用户账号无法进入本控制台。</p>
    </details>

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

    <form :aria-busy="submitting" aria-describedby="login-subtitle" novalidate @submit.prevent="submit">
      <div class="auth-field">
        <label for="login-email">账号或邮箱</label>
        <input
          id="login-email"
          v-model="email"
          type="text"
          name="email"
          autocomplete="username"
          placeholder="admin 或 you@company.com"
          required
          :aria-invalid="error ? 'true' : undefined"
        />
      </div>
      <div class="auth-field">
        <label for="login-password">密码</label>
        <div class="auth-password-row">
          <input
            id="login-password"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            name="password"
            autocomplete="current-password"
            required
            :aria-invalid="error ? 'true' : undefined"
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
      </div>
      <button type="submit" class="auth-submit" :disabled="submitting">
        <span v-if="submitting" class="auth-submit__spinner" aria-hidden="true" />
        {{ submitting ? '验证中…' : '进入控制台' }}
      </button>
    </form>

    <p class="auth-foot">
      需要演示账号？
      <router-link to="/admin/register">创建管理员（演示）</router-link>
    </p>
  </AdminAuthLayout>
</template>
