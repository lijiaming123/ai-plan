<script setup lang="ts">
import { ref } from "vue";
import AuthBackground from "./AuthBackground.vue";
import { getApiClient, HttpApiError } from "../../lib/api-client";

const email = ref("");
const loading = ref(false);
const okMessage = ref("");
const fieldError = ref("");

async function submit() {
  okMessage.value = "";
  fieldError.value = "";
  const raw = email.value.trim();
  if (!raw) {
    fieldError.value = "请输入邮箱地址";
    return;
  }
  loading.value = true;
  try {
    const r = await getApiClient().forgotPassword({ email: raw });
    okMessage.value = r.message;
  } catch (e) {
    if (e instanceof HttpApiError && e.status === 400) {
      fieldError.value = e.message || "请输入有效邮箱地址";
    } else {
      fieldError.value =
        e instanceof Error ? e.message : "提交失败，请稍后重试";
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthBackground>
    <div class="mx-auto flex w-full max-w-[960px] flex-1 flex-col px-4 py-5">
      <header class="flex items-center justify-between border-b border-b-[#f0f4f2] px-10 py-3">
        <div class="flex items-center gap-4">
          <div class="size-6 text-primary">
            <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path
                clip-rule="evenodd"
                d="M12.0799 24L4 19.2479L9.95537 8.75216L18.04 13.4961L18.0446 4H29.9554L29.96 13.4961L38.0446 8.75216L44 19.2479L35.92 24L44 28.7521L38.0446 39.2479L29.96 34.5039L29.9554 44H18.0446L18.04 34.5039L9.95537 39.2479L4 28.7521L12.0799 24Z"
                fill="currentColor"
                fill-rule="evenodd"
              />
            </svg>
          </div>
          <h2 class="text-lg font-bold leading-tight tracking-[-0.015em]">PlanMaster</h2>
        </div>
        <router-link
          to="/auth/login"
          class="text-sm font-medium text-[#111813]/80 transition-colors hover:text-primary"
          >返回登录</router-link
        >
      </header>

      <main class="flex flex-grow items-center justify-center">
        <div class="w-full max-w-lg px-4 py-16">
          <div class="flex flex-col gap-8">
            <div class="p-4 text-center">
              <p class="text-4xl font-black leading-tight tracking-[-0.033em]">重置您的密码</p>
              <p class="mt-3 text-base font-normal leading-normal text-[#61896f]">
                请输入与您账户关联的电子邮箱。演示环境不会发送真实重置邮件，提交后将显示说明。
              </p>
            </div>

            <div
              v-if="okMessage"
              class="mx-4 rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-3 text-left text-sm font-medium text-emerald-950"
              role="status"
              data-testid="forgot-password-success"
            >
              {{ okMessage }}
            </div>

            <div class="flex flex-col gap-6">
              <label class="flex flex-col px-4 py-3">
                <span class="pb-2 text-base font-medium">邮箱地址</span>
                <input
                  v-model="email"
                  type="email"
                  autocomplete="email"
                  class="h-14 rounded-lg border border-[#dbe6df] bg-white p-[15px] text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/50"
                  placeholder="yourname@example.com"
                  data-testid="forgot-password-email"
                  :disabled="loading"
                  @keyup.enter="submit"
                />
                <p
                  v-if="fieldError"
                  class="mt-2 text-sm font-medium text-rose-700"
                  data-testid="forgot-password-field-error"
                >
                  {{ fieldError }}
                </p>
              </label>
              <div class="flex justify-center px-4 py-3">
                <button
                  type="button"
                  class="flex h-12 w-full max-w-[480px] items-center justify-center rounded-lg bg-primary px-5 text-base font-bold text-[#111813] transition-opacity hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="forgot-password-submit"
                  :disabled="loading"
                  @click="submit"
                >
                  {{ loading ? "提交中…" : "发送重置说明" }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer class="flex flex-col gap-6 px-5 py-10 text-center">
        <div class="flex flex-wrap items-center justify-center gap-6">
          <a class="min-w-40 text-base font-normal text-[#61896f] transition-colors hover:text-primary"
            >隐私政策</a
          >
          <a class="min-w-40 text-base font-normal text-[#61896f] transition-colors hover:text-primary"
            >服务条款</a
          >
        </div>
        <p class="text-base font-normal text-[#61896f]">© 2024 PlanMaster. All Rights Reserved.</p>
      </footer>
    </div>
  </AuthBackground>
</template>
