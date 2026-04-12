<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getApiClient } from '../../lib/api-client';
import { setAuthTier, setAuthToken, setUserEmail } from '../../stores/auth';
import AuthBackground from './AuthBackground.vue';
import UiErrorToast from '../../components/UiErrorToast.vue';

const router = useRouter();
const route = useRoute();
const isRegisterMode = computed(() => route.name === 'register');
const form = reactive({
  email: 'demo@ai-plan.dev',
  password: 'Pass1234!',
  confirmPassword: '',
  useProTier: false,
});
const showPassword = ref(false);
const showConfirmPassword = ref(false);
const errorMessage = ref('');
const errorToastMessage = ref('');
const pageTitle = computed(() => (isRegisterMode.value ? '创建你的账号' : '欢迎回来'));
const pageSubtitle = computed(() => (isRegisterMode.value ? '开始建立你的计划体系' : '开始规划你的成功'));
const primaryActionText = computed(() => (isRegisterMode.value ? '创建并开始' : '进入我的计划'));

function validate() {
  if (!form.email.trim()) {
    errorMessage.value = '请输入用户名或邮箱';
    return false;
  }
  if (!form.password.trim()) {
    errorMessage.value = '请输入密码';
    return false;
  }
  if (isRegisterMode.value) {
    if (form.password.length < 6) {
      errorMessage.value = '密码长度至少为 6 位';
      return false;
    }
    if (form.password !== form.confirmPassword) {
      errorMessage.value = '两次输入的密码不一致';
      return false;
    }
  }
  errorMessage.value = '';
  return true;
}

async function handleSubmit() {
  if (!validate()) return;

  if (isRegisterMode.value) {
    setAuthTier('basic');
    await router.push('/auth/login');
    return;
  }

  try {
    const client = getApiClient();
    const result = await client.login(form);
    setAuthToken(result.token);
    setUserEmail(form.email.trim());
    setAuthTier(form.useProTier ? 'pro' : 'basic');
    await router.push('/plans');
  } catch (error) {
    errorToastMessage.value = error instanceof Error ? error.message : '登录失败，请稍后重试。';
  }
}
</script>

<template>
  <AuthBackground>
    <UiErrorToast :message="errorToastMessage" @close="errorToastMessage = ''" />
    <div class="flex min-h-screen w-full flex-col items-center justify-center p-4">
      <div class="w-full max-w-md">
      <div class="mb-8 text-center">
        <h1 class="pb-2 text-[32px] font-bold leading-tight tracking-tight">计划大师</h1>
        <h2 class="pb-2 text-2xl font-bold leading-tight tracking-tight">{{ pageTitle }}</h2>
        <p class="text-base font-normal text-[#61896f]">{{ pageSubtitle }}</p>
      </div>

      <div class="w-full rounded-xl border border-[#dbe6df] bg-white p-8 shadow-sm">
        <div class="flex pb-6">
          <div class="flex h-12 flex-1 items-center justify-center rounded-lg bg-[#f6f8f6] p-1">
            <router-link
              to="/auth/login"
              class="flex h-full grow items-center justify-center overflow-hidden rounded-lg px-2 text-sm font-medium leading-normal transition-all duration-200"
              :class="!isRegisterMode ? 'bg-white text-[#111813] shadow-[0_1px_3px_rgba(0,0,0,0.1)]' : 'text-[#61896f]'"
            >
              登录
            </router-link>
            <router-link
              to="/auth/register"
              class="flex h-full grow items-center justify-center overflow-hidden rounded-lg px-2 text-sm font-medium leading-normal transition-all duration-200"
              :class="isRegisterMode ? 'bg-white text-[#111813] shadow-[0_1px_3px_rgba(0,0,0,0.1)]' : 'text-[#61896f]'"
            >
              注册
            </router-link>
          </div>
        </div>

        <form class="space-y-6" @submit.prevent="handleSubmit">
          <div class="flex flex-col">
            <label for="login-email" class="pb-2 text-sm font-medium">用户名/邮箱</label>
            <input
              id="login-email"
              v-model="form.email"
              type="text"
              autocomplete="username"
              aria-label="邮箱"
              class="h-12 rounded-lg border border-[#dbe6df] bg-white p-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 focus:ring-offset-0"
              placeholder="请输入您的用户名或邮箱"
            />
          </div>

          <!-- 密码与可见性按钮不能放在同一个 <label> 内，否则点击眼睛会触发 label 对第一个 input 的默认行为，造成焦点/点击错乱 -->
          <div class="flex flex-col">
            <label for="login-password" class="pb-2 text-sm font-medium">密码</label>
            <div
              class="flex w-full min-w-0 items-stretch rounded-lg border border-[#dbe6df] bg-white outline-none transition-[box-shadow,border-color] focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/50 focus-within:ring-offset-0"
            >
              <input
                id="login-password"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                aria-label="密码"
                class="h-12 min-w-0 flex-1 rounded-l-lg border-0 border-r border-[#dbe6df] bg-transparent p-3 pr-2 text-base outline-none ring-0 focus:border-transparent focus:ring-0 focus:outline-none"
                placeholder="请输入您的密码"
              />
              <!-- 焦点统一交给外层 focus-within 绿色描边；按钮禁用浏览器默认蓝 outline，避免与图一不一致 -->
              <button
                type="button"
                class="flex shrink-0 items-center justify-center rounded-r-lg border-0 bg-white px-3 text-[#61896f] !outline-none hover:bg-[#f6f8f6] focus:!outline-none focus-visible:!outline-none focus-visible:ring-0"
                :aria-pressed="showPassword"
                :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                @click="showPassword = !showPassword"
              >
                <span class="material-symbols-outlined text-xl" aria-hidden="true">{{ showPassword ? 'visibility_off' : 'visibility' }}</span>
              </button>
            </div>
          </div>

          <label v-if="!isRegisterMode" class="flex items-center gap-3">
            <input
              v-model="form.useProTier"
              type="checkbox"
              aria-label="体验专业版能力"
              class="h-4 w-4 rounded border border-[#dbe6df] text-primary focus:ring-primary/40"
            />
            <span class="text-sm text-[#5f6d66]">体验专业版能力（登录后启用高级配置）</span>
          </label>

          <div v-if="isRegisterMode" class="flex flex-col">
            <label for="register-confirm-password" class="pb-2 text-sm font-medium">确认密码</label>
            <input
              id="register-confirm-password"
              v-model="form.confirmPassword"
              :type="showConfirmPassword ? 'text' : 'password'"
              autocomplete="new-password"
              aria-label="确认密码"
              class="h-12 rounded-lg border border-[#dbe6df] bg-white p-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 focus:ring-offset-0"
              placeholder="请再次输入密码"
            />
            <button
              type="button"
              class="mt-2 self-end text-xs text-[#61896f] hover:text-primary"
              @click="showConfirmPassword = !showConfirmPassword"
            >
              {{ showConfirmPassword ? '隐藏确认密码' : '显示确认密码' }}
            </button>
          </div>

          <div v-if="!isRegisterMode" class="flex justify-end pt-1">
            <router-link to="/auth/forgot-password" class="text-sm font-medium text-primary/80 transition-colors hover:text-primary">
              忘记密码?
            </router-link>
          </div>

          <p v-if="errorMessage" class="text-sm font-medium text-[#c0392b] dark:text-[#ff8e85]">{{ errorMessage }}</p>

          <button class="flex h-12 w-full items-center justify-center rounded-lg bg-primary px-6 text-base font-bold text-black transition-all hover:bg-opacity-90" type="submit">
            {{ primaryActionText }}
          </button>
        </form>

        <template v-if="!isRegisterMode">
          <div class="my-8 flex items-center">
            <hr class="flex-grow border-t border-gray-200" />
            <span class="mx-4 text-xs text-gray-500">或通过以下方式登录</span>
            <hr class="flex-grow border-t border-gray-200" />
          </div>
          <div class="flex items-center justify-center">
            <button class="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 transition-colors hover:bg-gray-200">
              <svg aria-hidden="true" class="h-6 w-6" fill="#38A169" viewBox="0 0 24 24">
                <path
                  clip-rule="evenodd"
                  d="M12 2C6.477 2 2 6.477 2 12c0 4.344 2.76 8.045 6.583 9.49.25.046.34-.108.34-.242 0-.12-.004-.438-.006-1.002-2.68.584-3.245-1.29-3.245-1.29-.227-.578-.555-.732-.555-.732-.454-.31.034-.303.034-.303.502.035.766.515.766.515.446.764 1.17.543 1.455.416.045-.323.174-.543.317-.667-1.11-.126-2.278-.555-2.278-2.472 0-.546.195-1 .514-1.352-.05-.127-.223-.64.05-1.332 0 0 .42-.134 1.375.512.4-.11.828-.165 1.255-.167.427.002.855.057 1.255.167.955-.646 1.373-.512 1.373-.512.273.692.1.1205.05 1.332.32.352.513.806.513 1.352 0 1.922-1.17 2.345-2.284 2.467.18.155.34.46.34.928 0 .67-.006 1.21-.006 1.374 0 .136.09.29.344.24C19.244 20.045 22 16.344 22 12c0-5.523-4.477-10-10-10z"
                  fill-rule="evenodd"
                />
              </svg>
            </button>
          </div>
        </template>
      </div>
    </div>
    </div>
  </AuthBackground>
</template>
