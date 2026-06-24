<script setup lang="ts">
import UserAvatarBadge from '../../../components/UserAvatarBadge.vue';

defineProps<{
  badgeLabel: string;
  displayNameModel: string;
  phoneForDisplay: string;
  roleLabel: string;
  meLoadError: boolean;
}>();

const emit = defineEmits<{
  'update:displayNameModel': [value: string];
  'display-name-blur': [];
}>();
</script>

<template>
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
            :value="displayNameModel"
            type="text"
            maxlength="32"
            class="w-full max-w-md rounded-xl border border-emerald-950/8 bg-white/90 px-3.5 py-2.5 text-stone-900 shadow-inner outline-none transition placeholder:text-stone-400 focus:border-[#0a8f4a]/50 focus:ring-2 focus:ring-[#0a8f4a]/20"
            data-testid="settings-display-name"
            @input="emit('update:displayNameModel', ($event.target as HTMLInputElement).value)"
            @blur="emit('display-name-blur')"
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
</template>
