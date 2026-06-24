<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageSectionHeading from '../../components/PageSectionHeading.vue';
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
import { useTierBadge } from '../../composables/useTierBadge';
import SettingsProfileSection from './components/SettingsProfileSection.vue';
import SettingsNotificationSection from './components/SettingsNotificationSection.vue';
import SettingsMembershipSection from './components/SettingsMembershipSection.vue';
import SettingsAssistantMemorySection from './components/SettingsAssistantMemorySection.vue';

const route = useRoute();
const router = useRouter();
const proSectionRef = ref<InstanceType<typeof SettingsMembershipSection> | null>(null);

const enableDemoTier = import.meta.env.VITE_ENABLE_DEMO_TIER_TOGGLE === 'true';
const renewUrl = String(import.meta.env.VITE_PRO_RENEW_URL ?? '').trim();
const helpProUrl = String(import.meta.env.VITE_PRO_HELP_ANCHOR ?? '/help#pro-tier').trim();

const {
  tierBadgeLabel,
  membershipKind,
  expiresDateText,
  expiresDaysLeft,
  priceYuan,
} = useTierBadge();

const aiQuotaLine = computed(() => {
  const q = authState.aiQuota;
  if (!q) return '';
  const left = Math.max(0, q.limit - q.used);
  return `本月智能生成：已用 ${q.used} / ${q.limit}，剩余 ${left} 次（账单月 ${q.yearMonth}）。`;
});

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
    proSectionRef.value?.el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      proSectionRef.value?.el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      <SettingsProfileSection
        v-model:display-name-model="displayNameModel"
        :badge-label="badgeLabel"
        :phone-for-display="phoneForDisplay"
        :role-label="roleLabel"
        :me-load-error="meLoadError"
        @display-name-blur="onDisplayNameBlur"
      />

      <div class="grid gap-6 lg:grid-cols-2">
        <SettingsNotificationSection
          :plan-deadline="userPreferences.notifications.planDeadline"
          :template-activity="userPreferences.notifications.templateActivity"
          @toggle-deadline="toggleNotifyDeadline"
          @toggle-template="toggleNotifyTemplate"
        />

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

      <SettingsAssistantMemorySection
        v-model:pa-tone="paTone"
        v-model:pa-weekly-hours="paWeeklyHours"
        v-model:pa-prefer-morning="paPreferMorning"
        v-model:pa-evidence="paEvidence"
        v-model:pa-default-scenario="paDefaultScenario"
        v-model:pa-pin-text="paPinText"
        :pa-load-error="paLoadError"
        :pa-saving="paSaving"
        :pa-pinning="paPinning"
        :pa-pinned-notes="paPinnedNotes"
        @save="savePlanAssistantProfile"
        @pin="pinPlanAssistantNote"
      />

      <SettingsMembershipSection
        ref="proSectionRef"
        :membership-kind="membershipKind"
        :price-yuan="priceYuan"
        :expires-date-text="expiresDateText"
        :expires-days-left="expiresDaysLeft"
        :ai-quota-line="aiQuotaLine"
        :trial-loading="trialLoading"
        :trial-error="trialError"
        :enable-demo-tier="enableDemoTier"
        :help-pro-url="helpProUrl"
        @start-trial="startProTrialAction"
        @open-renew="openRenewLink"
        @upgrade-demo="upgradeDemo"
      />

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
