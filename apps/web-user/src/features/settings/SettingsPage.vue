<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UserAvatarBadge from '../../components/UserAvatarBadge.vue';
import { getApiClient } from '../../lib/api-client';
import { authState, clearAuthToken, setAuthTier } from '../../stores/auth';
import { planListSearchQuery } from '../../stores/plan-search-query';
import { persistUserPreferences, userPreferences } from '../../stores/user-preferences';

const DISPLAY_NAME_KEY = 'ai-plan-display-name';

const route = useRoute();
const router = useRouter();
const proSection = ref<HTMLElement | null>(null);

const tierLabel = computed(() => (authState.tier === 'pro' ? '专业版' : '基础版'));

const meEmail = ref('');
const meRole = ref<'user' | 'admin' | null>(null);
const displayNameModel = ref('');
const meLoadError = ref(false);

const emailForDisplay = computed(() => meEmail.value || authState.userEmail || '');

function emailPrefix(email: string): string {
  const i = email.indexOf('@');
  return i > 0 ? email.slice(0, i) : email;
}

const badgeLabel = computed(() => {
  const n = displayNameModel.value.trim();
  if (n) return n;
  const e = emailForDisplay.value;
  return e ? emailPrefix(e) : '?';
});

const roleLabel = computed(() => {
  if (meRole.value === 'admin') return '管理员';
  if (meRole.value === 'user') return '用户';
  return '—';
});

function loadDisplayNameFromStorage() {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(DISPLAY_NAME_KEY) : null;
  const email = emailForDisplay.value;
  displayNameModel.value = stored?.trim() ? stored.trim().slice(0, 32) : email ? emailPrefix(email) : '';
}

function onDisplayNameBlur() {
  let v = displayNameModel.value.trim().slice(0, 32);
  displayNameModel.value = v;
  if (typeof localStorage === 'undefined') return;
  if (v) localStorage.setItem(DISPLAY_NAME_KEY, v);
  else localStorage.removeItem(DISPLAY_NAME_KEY);
}

function toggleNotifyDeadline() {
  userPreferences.notifications.planDeadline = !userPreferences.notifications.planDeadline;
  persistUserPreferences();
}

function toggleNotifyTemplate() {
  userPreferences.notifications.templateActivity = !userPreferences.notifications.templateActivity;
  persistUserPreferences();
}

function logout() {
  clearAuthToken();
  planListSearchQuery.value = '';
  void router.push('/auth/login');
}

function upgradeDemo() {
  setAuthTier('pro');
}

async function loadMe() {
  meLoadError.value = false;
  if (!authState.token) {
    meEmail.value = '';
    meRole.value = null;
    return;
  }
  try {
    const me = await getApiClient().getAuthMe({ token: authState.token });
    meEmail.value = me.email;
    meRole.value = me.role;
  } catch {
    meLoadError.value = true;
    meEmail.value = authState.userEmail;
    meRole.value = null;
  }
}

onMounted(async () => {
  await loadMe();
  loadDisplayNameFromStorage();
  if (route.query.focus === 'pro') {
    proSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

watch(
  () => authState.userEmail,
  () => {
    if (!meEmail.value && authState.userEmail) {
      meEmail.value = authState.userEmail;
    }
    loadDisplayNameFromStorage();
  },
);

watch(
  () => authState.token,
  async (token) => {
    if (token) await loadMe();
    else {
      meEmail.value = '';
      meRole.value = null;
    }
    loadDisplayNameFromStorage();
  },
);

watch(
  () => route.query.focus,
  (focus) => {
    if (focus === 'pro') {
      proSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  },
);
</script>

<template>
  <div
    class="settings-root ui-scrollbar relative h-full min-h-0 overflow-y-auto pr-1 font-plan text-[#1a2e22]"
  >
    <!-- 氛围底：柔光 + 轻噪点（限定在本页滚动区内） -->
    <div
      class="pointer-events-none absolute inset-0 -z-10 min-h-full opacity-100"
      style="
        background:
          radial-gradient(ellipse 720px 380px at 12% -8%, rgba(16, 185, 129, 0.14), transparent 55%),
          radial-gradient(ellipse 600px 320px at 88% 4%, rgba(253, 230, 138, 0.12), transparent 50%),
          radial-gradient(ellipse 500px 400px at 50% 108%, rgba(167, 243, 208, 0.18), transparent 58%),
          linear-gradient(175deg, #f7faf8 0%, #f1f5f3 48%, #eef4f0 100%);
      "
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute inset-0 -z-10 min-h-full opacity-[0.035]"
      style="
        background-image: url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E');
      "
      aria-hidden="true"
    />

    <div class="relative pb-12 pt-1">
      <header
        class="settings-panel settings-panel--d0 mb-8 flex flex-col gap-5 lg:mb-10 lg:flex-row lg:items-end lg:justify-between"
      >
        <div>
          <p class="mb-2 text-[10px] font-bold uppercase tracking-[0.28em] text-emerald-800/55">账户与工作区</p>
          <h1
            class="font-editorial text-[clamp(2.75rem,5vw,3.25rem)] font-semibold italic leading-[0.95] tracking-[-0.02em] text-[#0f1f16]"
          >
            设置
          </h1>
          <p class="mt-3 max-w-lg text-sm leading-relaxed text-[#5a6b62]">
            个人资料、通知与安全集中在此；会员与退出在下方。
          </p>
        </div>
        <div
          class="flex items-center gap-2 self-start rounded-2xl border border-emerald-200/60 bg-white/70 px-4 py-2.5 shadow-sm ring-1 ring-white/90 backdrop-blur-md lg:self-auto"
        >
          <span class="material-symbols-outlined text-xl text-[#0a8f4a]" aria-hidden="true">verified_user</span>
          <div class="text-left">
            <p class="text-[10px] font-bold uppercase tracking-wider text-[#7c8a84]">当前方案</p>
            <p class="text-sm font-bold text-stone-900">{{ tierLabel }}</p>
          </div>
        </div>
      </header>

      <!-- 个人资料：主视觉卡 -->
      <section
        class="settings-panel settings-panel--d1 group relative mb-6 overflow-hidden rounded-[1.35rem] border border-white/80 bg-white/75 p-6 shadow-[0_24px_56px_-38px_rgba(15,60,40,0.28)] ring-1 ring-emerald-950/[0.04] backdrop-blur-md sm:p-7"
      >
        <div
          class="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-emerald-400/15 blur-3xl transition duration-700 group-hover:bg-emerald-400/22"
          aria-hidden="true"
        />
        <div class="relative flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex items-center gap-2">
            <span
              class="flex size-9 items-center justify-center rounded-xl bg-emerald-500/10 text-[#0a8f4a] ring-1 ring-emerald-500/15"
            >
              <span class="material-symbols-outlined text-[22px]" aria-hidden="true">person</span>
            </span>
            <div>
              <h2 class="text-lg font-bold tracking-tight text-stone-900">个人资料</h2>
              <p class="text-xs text-[#7c8a84]">显示名存本机；头像是首字徽章。</p>
            </div>
          </div>
        </div>

        <div class="relative mt-6 flex flex-col gap-8 sm:flex-row sm:items-start">
          <UserAvatarBadge variant="featured" :label="badgeLabel" />
          <div class="min-w-0 flex-1 space-y-5 text-sm">
            <label class="block">
              <span class="mb-1.5 block text-xs font-semibold text-[#5c6d62]">显示名称</span>
              <input
                v-model="displayNameModel"
                type="text"
                maxlength="32"
                class="w-full max-w-md rounded-xl border border-emerald-950/8 bg-white/90 px-3.5 py-2.5 text-stone-900 shadow-inner outline-none transition placeholder:text-stone-400 focus:border-[#0a8f4a]/50 focus:ring-2 focus:ring-[#0a8f4a]/20"
                data-testid="settings-display-name"
                @blur="onDisplayNameBlur"
              />
            </label>
            <div class="grid gap-3 sm:max-w-md">
              <div
                class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200/80 bg-stone-50/50 px-3.5 py-3"
              >
                <span class="text-xs font-semibold text-[#6e7b75]">邮箱</span>
                <span class="font-medium text-stone-900">{{ emailForDisplay || '—' }}</span>
              </div>
              <div
                class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200/80 bg-stone-50/50 px-3.5 py-3"
              >
                <span class="text-xs font-semibold text-[#6e7b75]">角色</span>
                <span
                  class="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-900 ring-1 ring-emerald-200/70"
                  >{{ roleLabel }}</span
                >
              </div>
            </div>
            <p v-if="meLoadError" class="flex items-center gap-1.5 text-xs font-medium text-amber-900">
              <span class="material-symbols-outlined text-base" aria-hidden="true">cloud_off</span>
              无法从服务器同步身份，已使用本地缓存邮箱。
            </p>
          </div>
        </div>
      </section>

      <div class="grid gap-6 lg:grid-cols-2">
        <section
          class="settings-panel settings-panel--d2 rounded-[1.25rem] border border-white/80 bg-white/70 p-6 shadow-[0_18px_44px_-32px_rgba(15,50,35,0.35)] ring-1 ring-stone-200/60 backdrop-blur-sm"
        >
          <div class="flex items-center gap-2">
            <span
              class="flex size-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-800 ring-1 ring-amber-500/15"
            >
              <span class="material-symbols-outlined text-[22px]" aria-hidden="true">notifications</span>
            </span>
            <div>
              <h2 class="text-base font-bold text-stone-900">通知</h2>
              <p class="text-xs text-[#7c8a84]">本地偏好，后续可接通知中心。</p>
            </div>
          </div>
          <ul class="mt-5 space-y-1 text-sm">
            <li
              class="flex items-center justify-between gap-3 rounded-xl px-1 py-3 transition hover:bg-stone-50/80"
            >
              <span class="font-medium text-[#2d3d36]">计划截止提醒</span>
              <button
                type="button"
                role="switch"
                class="relative h-8 w-[3.25rem] shrink-0 rounded-full shadow-inner transition-colors duration-300 ease-out"
                :class="userPreferences.notifications.planDeadline ? 'bg-[#0a8f4a]' : 'bg-stone-300/90'"
                :aria-checked="userPreferences.notifications.planDeadline"
                data-testid="settings-notify-deadline"
                @click="toggleNotifyDeadline"
              >
                <span
                  class="absolute top-1 size-6 rounded-full bg-white shadow-md transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                  :style="{
                    left: userPreferences.notifications.planDeadline ? 'calc(100% - 1.625rem)' : '0.25rem',
                  }"
                />
              </button>
            </li>
            <li
              class="flex items-center justify-between gap-3 rounded-xl border-t border-stone-100 px-1 py-3 transition hover:bg-stone-50/80"
            >
              <span class="font-medium text-[#2d3d36]">模板互动</span>
              <button
                type="button"
                role="switch"
                class="relative h-8 w-[3.25rem] shrink-0 rounded-full shadow-inner transition-colors duration-300 ease-out"
                :class="userPreferences.notifications.templateActivity ? 'bg-[#0a8f4a]' : 'bg-stone-300/90'"
                :aria-checked="userPreferences.notifications.templateActivity"
                data-testid="settings-notify-template"
                @click="toggleNotifyTemplate"
              >
                <span
                  class="absolute top-1 size-6 rounded-full bg-white shadow-md transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                  :style="{
                    left: userPreferences.notifications.templateActivity ? 'calc(100% - 1.625rem)' : '0.25rem',
                  }"
                />
              </button>
            </li>
          </ul>
          <p class="mt-2 text-[11px] leading-snug text-[#8a9a92]">点赞、收藏等摘要提醒（占位）。</p>
        </section>

        <section
          class="settings-panel settings-panel--d3 rounded-[1.25rem] border border-white/80 bg-white/70 p-6 shadow-[0_18px_44px_-32px_rgba(15,50,35,0.35)] ring-1 ring-stone-200/60 backdrop-blur-sm"
        >
          <div class="flex items-center gap-2">
            <span
              class="flex size-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-900 ring-1 ring-sky-500/15"
            >
              <span class="material-symbols-outlined text-[22px]" aria-hidden="true">shield_lock</span>
            </span>
            <div>
              <h2 class="text-base font-bold text-stone-900">安全</h2>
              <p class="text-xs text-[#7c8a84]">演示环境说明与找回入口。</p>
            </div>
          </div>
          <p class="mt-4 text-sm leading-relaxed text-[#5a6b62]">
            账号由后端内置列表校验；正式环境将提供修改密码 API。
          </p>
          <router-link
            to="/auth/forgot-password"
            class="mt-5 inline-flex items-center gap-2 rounded-xl border border-emerald-200/70 bg-gradient-to-b from-white to-emerald-50/30 px-4 py-2.5 text-sm font-bold text-emerald-950 shadow-sm ring-1 ring-white transition hover:border-[#0a8f4a]/40 hover:shadow-md"
            data-testid="settings-forgot-password"
          >
            <span class="material-symbols-outlined text-[20px] text-[#0a8f4a]" aria-hidden="true">key</span>
            忘记密码
          </router-link>
        </section>
      </div>

      <section
        ref="proSection"
        class="settings-panel settings-panel--d4 relative mt-6 overflow-hidden rounded-[1.25rem] border border-amber-200/50 bg-gradient-to-br from-amber-50/40 via-white/80 to-emerald-50/30 p-6 shadow-[0_20px_48px_-36px_rgba(120,90,20,0.2)] ring-1 ring-white/90 backdrop-blur-sm sm:p-7"
      >
        <div
          class="pointer-events-none absolute -left-8 bottom-0 h-32 w-32 rounded-full bg-emerald-400/10 blur-2xl"
          aria-hidden="true"
        />
        <div class="relative flex flex-wrap items-start gap-3">
          <span
            class="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-200/80 to-amber-400/40 text-amber-950 ring-1 ring-amber-300/50"
          >
            <span class="material-symbols-outlined text-[22px]" aria-hidden="true">workspace_premium</span>
          </span>
          <div class="min-w-0 flex-1">
            <h2 class="text-base font-bold text-stone-900">会员</h2>
            <p class="mt-2 text-sm leading-relaxed text-[#5a6b62]">
              当前为 <span class="font-bold text-stone-800">{{ tierLabel }}</span
              >。专业版将开放更深 AI 与提醒策略；下方为本地演示。
            </p>
            <div class="mt-5 flex flex-wrap gap-3">
              <button
                v-if="authState.tier !== 'pro'"
                type="button"
                class="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#34d399] to-[#0a8f4a] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:brightness-105"
                data-testid="settings-upgrade-demo"
                @click="upgradeDemo"
              >
                <span class="material-symbols-outlined text-[20px]" aria-hidden="true">rocket_launch</span>
                模拟开通专业版（仅本机）
              </button>
              <p v-else class="inline-flex items-center gap-2 text-sm font-bold text-[#0a8f4a]">
                <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
                你当前已是专业版（演示状态）
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        class="settings-panel settings-panel--d5 mt-6 overflow-hidden rounded-[1.25rem] border border-rose-200/60 bg-gradient-to-br from-rose-50/90 to-white p-6 shadow-[0_16px_40px_-28px_rgba(180,50,50,0.18)] ring-1 ring-white/80"
      >
        <div class="flex items-center gap-2">
          <span
            class="flex size-9 items-center justify-center rounded-xl bg-rose-100 text-rose-800 ring-1 ring-rose-200/80"
          >
            <span class="material-symbols-outlined text-[22px]" aria-hidden="true">logout</span>
          </span>
          <div>
            <h2 class="text-base font-bold text-rose-950">退出登录</h2>
            <p class="text-xs text-rose-800/80">清除本地令牌并返回登录页。</p>
          </div>
        </div>
        <button
          type="button"
          class="mt-5 inline-flex items-center gap-2 rounded-xl border border-rose-300/70 bg-white px-5 py-2.5 text-sm font-bold text-rose-900 shadow-sm transition hover:bg-rose-50"
          data-testid="settings-logout"
          @click="logout"
        >
          <span class="material-symbols-outlined text-[20px]" aria-hidden="true">door_open</span>
          退出登录
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-panel {
  animation: settings-rise 0.62s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}

.settings-panel--d0 {
  animation-delay: 0.04s;
}
.settings-panel--d1 {
  animation-delay: 0.1s;
}
.settings-panel--d2 {
  animation-delay: 0.16s;
}
.settings-panel--d3 {
  animation-delay: 0.2s;
}
.settings-panel--d4 {
  animation-delay: 0.26s;
}
.settings-panel--d5 {
  animation-delay: 0.32s;
}

@keyframes settings-rise {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>
