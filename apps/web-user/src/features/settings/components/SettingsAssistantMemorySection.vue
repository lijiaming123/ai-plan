<script setup lang="ts">
import { authState } from '../../../stores/auth';

defineProps<{
  paLoadError: boolean;
  paSaving: boolean;
  paPinning: boolean;
  paTone: 'unset' | 'concise' | 'detailed';
  paWeeklyHours: string;
  paPreferMorning: boolean;
  paEvidence: 'unset' | 'low' | 'medium';
  paDefaultScenario: 'unset' | 'study' | 'work' | 'travel' | 'general';
  paPinnedNotes: string[];
  paPinText: string;
}>();

const emit = defineEmits<{
  'update:paTone': [value: 'unset' | 'concise' | 'detailed'];
  'update:paWeeklyHours': [value: string];
  'update:paPreferMorning': [value: boolean];
  'update:paEvidence': [value: 'unset' | 'low' | 'medium'];
  'update:paDefaultScenario': [value: 'unset' | 'study' | 'work' | 'travel' | 'general'];
  'update:paPinText': [value: string];
  save: [];
  pin: [];
}>();
</script>

<template>
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
          :value="paTone"
          class="w-full max-w-md rounded-xl border border-emerald-950/10 bg-white/90 px-3 py-2.5 text-stone-900 outline-none focus:border-[#0a8f4a]/45 focus:ring-2 focus:ring-[#0a8f4a]/18"
          data-testid="settings-pa-tone"
          @change="emit('update:paTone', ($event.target as HTMLSelectElement).value as 'unset' | 'concise' | 'detailed')"
        >
          <option value="unset">不特别指定</option>
          <option value="concise">简洁</option>
          <option value="detailed">详细</option>
        </select>
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-semibold text-[#5c6d62]">每周可投入上限（小时，1–168）</span>
        <input
          :value="paWeeklyHours"
          type="number"
          min="1"
          max="168"
          placeholder="留空表示不写入"
          class="w-full rounded-xl border border-emerald-950/10 bg-white/90 px-3 py-2.5 text-stone-900 outline-none focus:border-[#0a8f4a]/45 focus:ring-2 focus:ring-[#0a8f4a]/18"
          data-testid="settings-pa-weekly-hours"
          @input="emit('update:paWeeklyHours', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="flex items-center gap-2 self-end pb-2">
        <input
          :checked="paPreferMorning"
          type="checkbox"
          class="size-4 rounded border-stone-300 text-[#0a8f4a] focus:ring-[#0a8f4a]/30"
          data-testid="settings-pa-prefer-morning"
          @change="emit('update:paPreferMorning', ($event.target as HTMLInputElement).checked)"
        />
        <span class="text-sm font-medium">尽量安排早晨时段</span>
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-semibold text-[#5c6d62]">打卡证据偏好</span>
        <select
          :value="paEvidence"
          class="w-full rounded-xl border border-emerald-950/10 bg-white/90 px-3 py-2.5 text-stone-900 outline-none focus:border-[#0a8f4a]/45 focus:ring-2 focus:ring-[#0a8f4a]/18"
          data-testid="settings-pa-evidence"
          @change="emit('update:paEvidence', ($event.target as HTMLSelectElement).value as 'unset' | 'low' | 'medium')"
        >
          <option value="unset">不特别指定</option>
          <option value="low">轻量</option>
          <option value="medium">适中</option>
        </select>
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-semibold text-[#5c6d62]">创建页默认场景</span>
        <select
          :value="paDefaultScenario"
          class="w-full rounded-xl border border-emerald-950/10 bg-white/90 px-3 py-2.5 text-stone-900 outline-none focus:border-[#0a8f4a]/45 focus:ring-2 focus:ring-[#0a8f4a]/18"
          data-testid="settings-pa-default-scenario"
          @change="emit('update:paDefaultScenario', ($event.target as HTMLSelectElement).value as 'unset' | 'study' | 'work' | 'travel' | 'general')"
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
            :value="paPinText"
            type="text"
            maxlength="200"
            placeholder="例如：我对咖啡因敏感，早晨不要安排咖啡相关任务"
            class="min-w-0 flex-1 rounded-xl border border-emerald-950/10 bg-white/90 px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-[#0a8f4a]/45 focus:ring-2 focus:ring-[#0a8f4a]/18"
            data-testid="settings-pa-pin-input"
            @input="emit('update:paPinText', ($event.target as HTMLInputElement).value)"
            @keydown.enter.prevent="emit('pin')"
          />
          <button
            type="button"
            class="shrink-0 rounded-xl border border-emerald-300/80 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-950 transition hover:bg-emerald-100/80 disabled:opacity-50"
            data-testid="settings-pa-pin-submit"
            :disabled="paPinning || !paPinText.trim()"
            @click="emit('pin')"
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
          @click="emit('save')"
        >
          {{ paSaving ? '保存中…' : '保存偏好' }}
        </button>
      </div>
    </div>
    <p v-else class="mt-4 text-sm text-[#7c8a84]">登录后可配置计划助手记忆。</p>
  </section>
</template>
