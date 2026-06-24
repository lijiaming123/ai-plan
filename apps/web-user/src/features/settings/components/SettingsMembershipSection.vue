<script setup lang="ts">
import { ref } from 'vue';
import { authState } from '../../../stores/auth';

type MembershipKind = 'trial_eligible' | 'active' | 'expired';

defineProps<{
  membershipKind: MembershipKind;
  priceYuan: string;
  expiresDateText: string;
  expiresDaysLeft: number | null;
  aiQuotaLine: string;
  trialLoading: boolean;
  trialError: string;
  enableDemoTier: boolean;
  helpProUrl: string;
}>();

const emit = defineEmits<{
  'start-trial': [];
  'open-renew': [];
  'upgrade-demo': [];
}>();

const rootRef = ref<HTMLElement | null>(null);
defineExpose({ el: rootRef });
</script>

<template>
  <section
    ref="rootRef"
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
            @click="emit('start-trial')"
          >
            <span class="material-symbols-outlined text-[20px]" aria-hidden="true">timer</span>
            {{ trialLoading ? '开通中…' : '开始 7 天免费试用' }}
          </button>
          <button
            v-if="membershipKind === 'active' || membershipKind === 'expired'"
            type="button"
            class="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#34d399] to-[#0a8f4a] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:brightness-105"
            data-testid="settings-renew-pro"
            @click="emit('open-renew')"
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
            @click="emit('upgrade-demo')"
          >
            模拟开通专业版（仅演示）
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
