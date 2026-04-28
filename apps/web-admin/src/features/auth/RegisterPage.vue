<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AdminAuthLayout from './AdminAuthLayout.vue';
import { getDefaultAdminPath } from '../../lib/admin-access';
import { getAdminApiClient } from '../../lib/api-client';
import { adminProfile, clearAdminToken, hydrateAdminProfile, setAdminToken } from '../../stores/auth';

const router = useRouter();

const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const showPassword = ref(false);
const preset = ref<'analyst' | 'auditor'>('analyst');
const submitting = ref(false);
const error = ref('');
const errorSummaryRef = ref<HTMLElement | null>(null);

const emailOk = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()));
const passwordOk = computed(() => password.value.length >= 8);
const passwordMatch = computed(() => password.value === confirmPassword.value && confirmPassword.value.length > 0);
const canSubmit = computed(() => emailOk.value && passwordOk.value && passwordMatch.value);

watch(error, async (msg) => {
  if (!msg) return;
  await nextTick();
  errorSummaryRef.value?.focus();
});

async function submit() {
  error.value = '';

  if (!emailOk.value) {
    error.value = '请输入有效邮箱。';
    return;
  }

  if (!passwordOk.value) {
    error.value = '密码至少需要 8 位。';
    return;
  }

  if (!passwordMatch.value) {
    error.value = '两次输入的密码不一致。';
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
    const ok = await hydrateAdminProfile(true);
    if (!ok) {
      clearAdminToken();
      error.value = '账号已创建，但无法完成管理员身份校验，请返回登录页重试。';
      return;
    }
    await router.replace(getDefaultAdminPath(adminProfile.permissions));
  } catch (e) {
    error.value = e instanceof Error ? e.message : '注册失败，请稍后重试。';
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
      演示环境可通过 <code class="auth-inline-code">ADMIN_OPEN_REGISTER=true</code> 开启自助注册，并自动分配预置角色包。
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
          :aria-invalid="!emailOk && email.length > 0 ? 'true' : undefined"
        />
        <p class="auth-field-hint" :class="{ 'auth-field-hint--ok': emailOk }">
          {{ email.length === 0 ? '用于接收管理员身份标识' : emailOk ? '邮箱格式可用' : '请填写有效邮箱' }}
        </p>
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
          {{ passwordOk ? '密码长度已满足要求' : '至少 8 位字符' }}
        </p>
      </div>

      <div class="auth-field">
        <label for="reg-confirm-password">确认密码</label>
        <input
          id="reg-confirm-password"
          v-model="confirmPassword"
          :type="showPassword ? 'text' : 'password'"
          name="confirmPassword"
          autocomplete="new-password"
          required
          :aria-invalid="confirmPassword.length > 0 && !passwordMatch ? 'true' : undefined"
        />
        <p
          class="auth-field-hint"
          :class="{ 'auth-field-hint--ok': passwordMatch }"
        >
          {{
            confirmPassword.length === 0
              ? '再次输入密码确认'
              : passwordMatch
                ? '两次输入一致'
                : '两次输入不一致'
          }}
        </p>
      </div>

      <div class="auth-field">
        <span id="preset-label" class="auth-preset-legend">角色包</span>
        <div class="auth-preset-grid" role="radiogroup" aria-labelledby="preset-label">
          <label class="auth-preset" :class="{ 'auth-preset--active': preset === 'analyst' }">
            <input v-model="preset" type="radio" name="preset" value="analyst" />
            <div>
              <strong>运营分析</strong>
              <span>可查看总览、报表与业务用户画像，适合增长和运营同学。</span>
            </div>
          </label>
          <label class="auth-preset" :class="{ 'auth-preset--active': preset === 'auditor' }">
            <input v-model="preset" type="radio" name="preset" value="auditor" />
            <div>
              <strong>审计只读</strong>
              <span>可查看分析与审计相关信息，适合合规和治理场景。</span>
            </div>
          </label>
        </div>
      </div>

      <button type="submit" class="auth-submit" :disabled="submitting || !canSubmit">
        <span v-if="submitting" class="auth-submit__spinner" aria-hidden="true" />
        {{ submitting ? '创建中...' : '创建并登录' }}
      </button>
    </form>

    <p class="auth-foot">
      已有账号？
      <router-link to="/admin/login">返回登录</router-link>
    </p>
  </AdminAuthLayout>
</template>
