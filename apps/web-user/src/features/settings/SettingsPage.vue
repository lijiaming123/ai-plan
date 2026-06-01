<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageSectionHeading from '../../components/PageSectionHeading.vue';
import UserAvatarBadge from '../../components/UserAvatarBadge.vue';
import {
  getApiClient,
  HttpApiError,
  type PlanAssistantProfilePatchInput,
} from '../../lib/api-client';
import { authState, clearAuthToken, setAuthBillingFromMe, setAuthTier } from '../../stores/auth';
import { planListSearchQuery } from '../../stores/plan-search-query';
import { persistUserPreferences, userPreferences } from '../../stores/user-preferences';
import {
  displayProfileState,
  emailPrefix,
  refreshDisplayProfileFromStorage,
  setDisplayProfileName,
} from '../../stores/display-profile';

const route = useRoute();
const router = useRouter();
const proSection = ref<HTMLElement | null>(null);

const enableDemoTier = import.meta.env.VITE_ENABLE_DEMO_TIER_TOGGLE === 'true';
const renewUrl = String(import.meta.env.VITE_PRO_RENEW_URL ?? '').trim();
const helpProUrl = String(import.meta.env.VITE_PRO_HELP_ANCHOR ?? '/help#pro-tier').trim();

const tierBadgeLabel = computed(() => {
  if (authState.tier === 'pro') {
    return authState.subscriptionSource === 'trial' ? '专业版（试用）' : '专业版';
  }
  return '基础版';
});

/** trial_eligible | active | expired */
const membershipKind = computed(() => {
  if (authState.tier === 'pro') return 'active';
  if (authState.proTrialUsed) return 'expired';
  return 'trial_eligible';
});

const priceYuan = computed(() => {
  const cents = authState.priceCents > 0 ? authState.priceCents : 1900;
  return (cents / 100).toFixed(0);
});

const aiQuotaLine = computed(() => {
  const q = authState.aiQuota;
  if (!q) return '';
  const left = Math.max(0, q.limit - q.used);
  return `本月智能生成：已用 ${q.used} / ${q.limit}，剩余 ${left} 次（账单月 ${q.yearMonth}）。`;
});

function formatExpiresDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleDateString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return '';
  }
}

function daysUntilExpires(iso: string): number {
  try {
    const end = new Date(iso).getTime();
    if (!Number.isFinite(end)) return 0;
    return Math.max(0, Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000)));
  } catch {
    return 0;
  }
}

const expiresDateText = computed(() =>
  authState.proExpiresAt ? formatExpiresDate(authState.proExpiresAt) : '',
);

const expiresDaysLeft = computed(() =>
  authState.proExpiresAt ? daysUntilExpires(authState.proExpiresAt) : 0,
);

const trialLoading = ref(false);
const trialError = ref('');

async function startProTrialAction() {
  if (!authState.token) return;
  trialError.value = '';
  trialLoading.value = true;
  try {
    const me = await getApiClient().startProTrial({ token: authState.token });
    setAuthBillingFromMe(me);
  } catch (e) {
    trialError.value =
      e instanceof Error ? e.message : '无法开通试用，请稍后再试';
  } finally {
    trialLoading.value = false;
  }
}

function openRenewLink() {
  if (renewUrl) {
    window.open(renewUrl, '_blank', 'noopener,noreferrer');
  }
}

function upgradeDemo() {
  setAuthTier('pro');
}

const mePhone = ref('');
const meRole = ref<'user' | 'admin' | null>(null);
const displayNameModel = ref('');
const meLoadError = ref(false);

/** 计划助手结构化偏好（服务端持久化） */
const paLoadError = ref(false);
const paSaving = ref(false);
const paPinning = ref(false);
const paTone = ref<'unset' | 'concise' | 'detailed'>('unset');
const paWeeklyHours = ref('');
const paPreferMorning = ref(false);
const paEvidence = ref<'unset' | 'low' | 'medium'>('unset');
const paDefaultScenario = ref<'unset' | 'study' | 'work' | 'travel' | 'general'>('unset');
const paPinnedNotes = ref<string[]>([]);
const paPinText = ref('');

function resetPlanAssistantFormFromProfile(p: {
  tone: string | null;
  weeklyHoursCap: number | null;
  preferMorning: boolean | null;
  evidenceTolerance: string | null;
  defaultScenario: string | null;
  pinnedNotes: string[];
}) {
  if (p.tone === 'concise' || p.tone === 'detailed') paTone.value = p.tone;
  else paTone.value = 'unset';
  paWeeklyHours.value =
    p.weeklyHoursCap != null && p.weeklyHoursCap > 0 ? String(p.weeklyHoursCap) : '';
  paPreferMorning.value = p.preferMorning === true;
  if (p.evidenceTolerance === 'low' || p.evidenceTolerance === 'medium') {
    paEvidence.value = p.evidenceTolerance;
  } else {
    paEvidence.value = 'unset';
  }
  if (
    p.defaultScenario === 'study' ||
    p.defaultScenario === 'work' ||
    p.defaultScenario === 'travel' ||
    p.defaultScenario === 'general'
  ) {
    paDefaultScenario.value = p.defaultScenario;
  } else {
    paDefaultScenario.value = 'unset';
  }
  paPinnedNotes.value = [...p.pinnedNotes];
}

async function loadPlanAssistantProfile() {
  paLoadError.value = false;
  if (!authState.token) return;
  try {
    const ctx = await getApiClient().getPlanAssistantContext({ token: authState.token });
    resetPlanAssistantFormFromProfile(ctx.profile);
  } catch (e) {
    if (e instanceof HttpApiError && e.status === 404) return;
    paLoadError.value = true;
  }
}

async function savePlanAssistantProfile() {
  if (!authState.token) return;
  paSaving.value = true;
  try {
    const capRaw = paWeeklyHours.value.trim();
    let weeklyHoursCap: number | null = null;
    if (capRaw) {
      const n = Number(capRaw);
      if (!Number.isInteger(n) || n < 1 || n > 168) {
        paSaving.value = false;
        return;
      }
      weeklyHoursCap = n;
    }
    const body: PlanAssistantProfilePatchInput = {
      token: authState.token,
      tone: paTone.value === 'unset' ? null : paTone.value,
      weeklyHoursCap,
      preferMorning: paPreferMorning.value ? true : null,
      evidenceTolerance: paEvidence.value === 'unset' ? null : paEvidence.value,
      defaultScenario: paDefaultScenario.value === 'unset' ? null : paDefaultScenario.value,
    };
    const ctx = await getApiClient().patchPlanAssistantProfile(body);
    resetPlanAssistantFormFromProfile(ctx.profile);
  } catch {
    paLoadError.value = true;
  } finally {
    paSaving.value = false;
  }
}

async function pinPlanAssistantNote() {
  const t = paPinText.value.trim();
  if (!t || !authState.token) return;
  paPinning.value = true;
  try {
    const ctx = await getApiClient().postPlanAssistantPinNote({
      token: authState.token,
      text: t,
    });
    paPinText.value = '';
    resetPlanAssistantFormFromProfile(ctx.profile);
  } catch {
    paLoadError.value = true;
  } finally {
    paPinning.value = false;
  }
}

const phoneForDisplay = computed(() => mePhone.value || authState.userPhone || '');

const badgeLabel = computed(() => {
  const n = displayNameModel.value.trim();
  if (n) return n;
  const e = phoneForDisplay.value;
  return e ? emailPrefix(e) : '?';
});

const roleLabel = computed(() => {
  if (meRole.value === 'admin') return '管理员';
  if (meRole.value === 'user') return '用户';
  return '—';
});

function loadDisplayNameFromStorage() {
  refreshDisplayProfileFromStorage();
  const stored = displayProfileState.localDisplayName;
  const phone = phoneForDisplay.value;
  displayNameModel.value = stored?.trim()
    ? stored.trim().slice(0, 32)
    : phone
      ? emailPrefix(phone)
      : '';
}

function onDisplayNameBlur() {
  let v = displayNameModel.value.trim().slice(0, 32);
  displayNameModel.value = v;
  setDisplayProfileName(v);
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

async function loadMe() {
  meLoadError.value = false;
  if (!authState.token) {
    mePhone.value = '';
    meRole.value = null;
    return;
  }
  try {
    const me = await getApiClient().getAuthMe({ token: authState.token });
    mePhone.value = me.email;
    meRole.value = me.role;
    setAuthBillingFromMe(me);
  } catch {
    meLoadError.value = true;
    mePhone.value = authState.userPhone;
    meRole.value = null;
  }
}

onMounted(async () => {
  await loadMe();
  loadDisplayNameFromStorage();
  await loadPlanAssistantProfile();
  if (route.query.focus === 'pro') {
    proSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

watch(
  () => authState.userPhone,
  () => {
    if (!mePhone.value && authState.userPhone) {
      mePhone.value = authState.userPhone;
    }
    loadDisplayNameFromStorage();
  },
);

watch(
  () => authState.token,
  async (token) => {
    if (token) {
      await loadMe();
      await loadPlanAssistantProfile();
    } else {
      mePhone.value = '';
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
    class="settings-root relative flex h-full min-h-0 w-full flex-col overflow-hidden font-plan text-[#1a2e22]"
  >
      <header
        class="settings-panel settings-panel--d0 relative z-[1] mb-4 flex shrink-0 flex-col gap-3 lg:mb-5 lg:flex-row lg:items-end lg:justify-between"
      >
        <PageSectionHeading kicker="账户与工作区" title="设置">
          <p class="max-w-lg">个人资料、通知与安全集中在此；会员与退出在下方。</p>
        </PageSectionHeading>
        <div
          class="flex items-center gap-2 self-start rounded-2xl border border-emerald-200/60 bg-white/70 px-4 py-2.5 shadow-sm ring-1 ring-white/90 backdrop-blur-md lg:self-auto"
        >
          <span class="material-symbols-outlined text-xl text-[#0a8f4a]" aria-hidden="true">verified_user</span>
          <div class="text-left">
            <p class="text-[10px] font-bold uppercase tracking-wider text-[#7c8a84]">当前方案</p>
            <p class="text-sm font-bold text-stone-900" data-testid="settings-tier-badge">
              {{ tierBadgeLabel }}
            </p>
          </div>
        </div>
      </header>

    <div class="ui-scrollbar relative min-h-0 flex-1 overflow-y-auto pr-1">
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
      <div class="relative pb-12 pt-0.5">

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
                <span class="text-xs font-semibold text-[#6e7b75]">手机号</span>
                <span class="font-medium text-stone-900">{{ phoneForDisplay || '—' }}</span>
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
              无法从服务器同步身份，已使用本地缓存手机号。
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
            普通版使用手机号验证码登录；收不到验证码时可前往恢复入口重发。
          </p>
          <router-link
            to="/auth/forgot-password"
            class="mt-5 inline-flex items-center gap-2 rounded-xl border border-emerald-200/70 bg-gradient-to-b from-white to-emerald-50/30 px-4 py-2.5 text-sm font-bold text-emerald-950 shadow-sm ring-1 ring-white transition hover:border-[#0a8f4a]/40 hover:shadow-md"
            data-testid="settings-forgot-password"
          >
            <span class="material-symbols-outlined text-[20px] text-[#0a8f4a]" aria-hidden="true">key</span>
            验证码找回登录
          </router-link>
        </section>
      </div>

      <section
        class="settings-panel settings-panel--d3b relative mt-6 overflow-hidden rounded-[1.25rem] border border-emerald-200/55 bg-white/75 p-6 shadow-[0_18px_44px_-32px_rgba(15,90,50,0.22)] ring-1 ring-emerald-950/[0.04] backdrop-blur-sm sm:p-7"
      >
        <div class="flex items-center gap-2">
          <span
            class="flex size-9 items-center justify-center rounded-xl bg-emerald-500/12 text-[#0a8f4a] ring-1 ring-emerald-500/18"
          >
            <span class="material-symbols-outlined text-[22px]" aria-hidden="true">psychology</span>
          </span>
          <div>
            <h2 class="text-base font-bold text-stone-900">计划助手记忆</h2>
            <p class="text-xs text-[#7c8a84]">
              偏好与「记住一句」会写入服务端；创建计划时自动注入近期执行摘要（非 RAG），不读取历史正文全文。
            </p>
          </div>
        </div>
        <p v-if="paLoadError" class="mt-3 text-xs font-medium text-amber-900">
          无法同步计划助手配置，请稍后重试。
        </p>
        <div
          v-else-if="authState.token"
          class="mt-5 grid gap-4 text-sm text-[#2d3d36] sm:grid-cols-2"
        >
          <label class="block sm:col-span-2">
            <span class="mb-1.5 block text-xs font-semibold text-[#5c6d62]">写作风格</span>
            <select
              v-model="paTone"
              class="w-full max-w-md rounded-xl border border-emerald-950/10 bg-white/90 px-3 py-2.5 text-stone-900 outline-none focus:border-[#0a8f4a]/45 focus:ring-2 focus:ring-[#0a8f4a]/18"
              data-testid="settings-pa-tone"
            >
              <option value="unset">不特别指定</option>
              <option value="concise">简洁</option>
              <option value="detailed">详细</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-1.5 block text-xs font-semibold text-[#5c6d62]">每周可投入上限（小时，1–168）</span>
            <input
              v-model="paWeeklyHours"
              type="number"
              min="1"
              max="168"
              placeholder="留空表示不写入"
              class="w-full rounded-xl border border-emerald-950/10 bg-white/90 px-3 py-2.5 text-stone-900 outline-none focus:border-[#0a8f4a]/45 focus:ring-2 focus:ring-[#0a8f4a]/18"
              data-testid="settings-pa-weekly-hours"
            />
          </label>
          <label class="flex items-center gap-2 self-end pb-2">
            <input
              v-model="paPreferMorning"
              type="checkbox"
              class="size-4 rounded border-stone-300 text-[#0a8f4a] focus:ring-[#0a8f4a]/30"
              data-testid="settings-pa-prefer-morning"
            />
            <span class="text-sm font-medium">尽量安排早晨时段</span>
          </label>
          <label class="block">
            <span class="mb-1.5 block text-xs font-semibold text-[#5c6d62]">打卡证据偏好</span>
            <select
              v-model="paEvidence"
              class="w-full rounded-xl border border-emerald-950/10 bg-white/90 px-3 py-2.5 text-stone-900 outline-none focus:border-[#0a8f4a]/45 focus:ring-2 focus:ring-[#0a8f4a]/18"
              data-testid="settings-pa-evidence"
            >
              <option value="unset">不特别指定</option>
              <option value="low">轻量</option>
              <option value="medium">适中</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-1.5 block text-xs font-semibold text-[#5c6d62]">创建页默认场景</span>
            <select
              v-model="paDefaultScenario"
              class="w-full rounded-xl border border-emerald-950/10 bg-white/90 px-3 py-2.5 text-stone-900 outline-none focus:border-[#0a8f4a]/45 focus:ring-2 focus:ring-[#0a8f4a]/18"
              data-testid="settings-pa-default-scenario"
            >
              <option value="unset">不默认</option>
              <option value="study">学习备考</option>
              <option value="work">工作项目</option>
              <option value="travel">旅行行程</option>
              <option value="general">通用/习惯</option>
            </select>
          </label>
          <div class="sm:col-span-2">
            <p class="mb-1.5 text-xs font-semibold text-[#5c6d62]">已记住的短句（最多 5 条）</p>
            <ul v-if="paPinnedNotes.length" class="mb-2 space-y-1 rounded-xl border border-stone-200/80 bg-stone-50/60 px-3 py-2 text-xs text-stone-800">
              <li v-for="(n, i) in paPinnedNotes" :key="`${i}-${n}`" class="leading-snug">· {{ n }}</li>
            </ul>
            <p v-else class="mb-2 text-xs text-[#8a9a92]">暂无；在下方输入后点「记住一句」。</p>
            <div class="flex flex-col gap-2 sm:flex-row sm:items-end">
              <input
                v-model="paPinText"
                type="text"
                maxlength="200"
                placeholder="例如：我对咖啡因敏感，早晨不要安排咖啡相关任务"
                class="min-w-0 flex-1 rounded-xl border border-emerald-950/10 bg-white/90 px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-[#0a8f4a]/45 focus:ring-2 focus:ring-[#0a8f4a]/18"
                data-testid="settings-pa-pin-input"
                @keydown.enter.prevent="pinPlanAssistantNote"
              />
              <button
                type="button"
                class="shrink-0 rounded-xl border border-emerald-300/80 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-950 transition hover:bg-emerald-100/80 disabled:opacity-50"
                data-testid="settings-pa-pin-submit"
                :disabled="paPinning || !paPinText.trim()"
                @click="pinPlanAssistantNote"
              >
                {{ paPinning ? '保存中…' : '记住一句' }}
              </button>
            </div>
          </div>
          <div class="sm:col-span-2">
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#34d399] to-[#0a8f4a] px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-600/20 transition hover:brightness-105 disabled:opacity-50"
              data-testid="settings-pa-save"
              :disabled="paSaving"
              @click="savePlanAssistantProfile"
            >
              {{ paSaving ? '保存中…' : '保存偏好' }}
            </button>
          </div>
        </div>
        <p v-else class="mt-4 text-sm text-[#7c8a84]">登录后可配置计划助手记忆。</p>
      </section>

      <section
        ref="proSection"
        class="settings-panel settings-panel--d4 relative mt-6 overflow-hidden rounded-[1.25rem] border border-amber-200/50 bg-gradient-to-br from-amber-50/40 via-white/80 to-emerald-50/30 p-6 shadow-[0_20px_48px_-36px_rgba(120,90,20,0.2)] ring-1 ring-white/90 backdrop-blur-sm sm:p-7"
        data-testid="settings-membership"
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
            <p
              class="mt-2 text-sm leading-relaxed text-[#5a6b62]"
              data-testid="settings-membership-price"
            >
              专业版
              <span class="font-bold text-stone-800">¥{{ priceYuan }}/月</span>，含更高月度智能生成额度与进阶计划助手。
            </p>

            <template v-if="membershipKind === 'trial_eligible'">
              <p class="mt-2 text-sm leading-relaxed text-[#5a6b62]">
                新用户可 <span class="font-bold text-stone-800">免费试用 7 天</span>（每人一次），无需付款。
              </p>
            </template>
            <template v-else-if="membershipKind === 'active'">
              <p class="mt-2 text-sm leading-relaxed text-[#5a6b62]">
                <template v-if="authState.subscriptionSource === 'trial'">
                  你正在使用 <span class="font-bold text-stone-800">专业版（试用）</span>。
                </template>
                <template v-else>
                  你正在使用 <span class="font-bold text-stone-800">专业版</span>。
                </template>
              </p>
              <p
                v-if="expiresDateText"
                class="mt-1 text-sm font-medium text-stone-800"
                data-testid="settings-membership-expires"
              >
                到期时间：{{ expiresDateText }}（剩余 {{ expiresDaysLeft }} 天）
              </p>
            </template>
            <template v-else>
              <p class="mt-2 text-sm leading-relaxed text-[#5a6b62]">
                专业版已到期。续费 <span class="font-bold text-stone-800">¥{{ priceYuan }}/月</span> 可继续使用。
              </p>
              <p class="mt-1 text-xs text-[#7c8a84]">7 天试用已使用，无法再次开通。</p>
            </template>

            <p
              v-if="aiQuotaLine"
              class="mt-2 text-sm font-medium leading-relaxed text-stone-800"
              data-testid="settings-ai-quota"
            >
              {{ aiQuotaLine }}
            </p>
            <p
              class="mt-3 text-xs leading-relaxed text-[#7c8a84]"
              data-testid="settings-membership-renew-hint"
            >
              按月计费，暂不支持自动扣款。付款后凭注册手机号联系开通，通常 24 小时内生效。
            </p>
            <p v-if="trialError" class="mt-2 text-xs font-medium text-rose-800">{{ trialError }}</p>

            <div class="mt-5 flex flex-wrap gap-3">
              <button
                v-if="membershipKind === 'trial_eligible'"
                type="button"
                class="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#34d399] to-[#0a8f4a] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:brightness-105 disabled:opacity-60"
                data-testid="settings-start-trial"
                :disabled="trialLoading || !authState.token"
                @click="startProTrialAction"
              >
                <span class="material-symbols-outlined text-[20px]" aria-hidden="true">timer</span>
                {{ trialLoading ? '开通中…' : '开始 7 天免费试用' }}
              </button>
              <button
                v-if="membershipKind === 'active' || membershipKind === 'expired'"
                type="button"
                class="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#34d399] to-[#0a8f4a] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:brightness-105"
                data-testid="settings-renew-pro"
                @click="openRenewLink"
              >
                <span class="material-symbols-outlined text-[20px]" aria-hidden="true">payments</span>
                {{
                  membershipKind === 'active' && authState.subscriptionSource === 'trial'
                    ? '试用结束后续费（¥' + priceYuan + '/月）'
                    : '续费专业版（¥' + priceYuan + '/月）'
                }}
              </button>
              <router-link
                :to="helpProUrl"
                class="inline-flex items-center gap-2 rounded-xl border border-emerald-200/70 bg-white px-4 py-2.5 text-sm font-bold text-emerald-950 shadow-sm transition hover:border-[#0a8f4a]/40"
                data-testid="settings-pro-benefits-link"
              >
                <span class="material-symbols-outlined text-[20px] text-[#0a8f4a]" aria-hidden="true">info</span>
                查看专业版权益
              </router-link>
              <button
                v-if="enableDemoTier && authState.tier !== 'pro'"
                type="button"
                class="inline-flex items-center gap-2 rounded-xl border border-amber-300/80 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-950 transition hover:bg-amber-100/80"
                data-testid="settings-upgrade-demo"
                @click="upgradeDemo"
              >
                模拟开通专业版（仅演示）
              </button>
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
.settings-panel--d3b {
  animation-delay: 0.23s;
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
