<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { authState } from '../../stores/auth';

const router = useRouter();

const greeting = computed(() => {
  const email = authState.userEmail || '用户';
  const short = email.includes('@') ? email.split('@')[0] : email;
  return short;
});
</script>

<template>
  <div class="ui-scrollbar h-full overflow-y-auto pr-1">
    <h1 class="mb-2 text-[46px] font-black leading-none tracking-[-0.03em]">仪表盘</h1>
    <p class="mb-8 text-sm text-[#5d6a64]">你好，{{ greeting }}。从这里快速进入计划与设置。</p>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <router-link
        to="/plans"
        class="rounded-2xl border border-[#e6ebe8] bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        data-testid="dash-card-plans"
      >
        <span class="material-symbols-outlined mb-3 block text-3xl text-[#0a8f4a]">folder</span>
        <p class="text-lg font-bold">我的计划</p>
        <p class="mt-1 text-sm text-[#7c8a84]">查看、筛选并管理所有计划</p>
      </router-link>

      <router-link
        to="/plans/new"
        class="rounded-2xl border border-[#e6ebe8] bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        data-testid="dash-card-create"
      >
        <span class="material-symbols-outlined mb-3 block text-3xl text-[#0a8f4a]">add_circle</span>
        <p class="text-lg font-bold">创建计划</p>
        <p class="mt-1 text-sm text-[#7c8a84]">新建项目并开始拆解任务</p>
      </router-link>

      <router-link
        to="/templates"
        class="rounded-2xl border border-[#e6ebe8] bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        data-testid="dash-card-templates"
      >
        <span class="material-symbols-outlined mb-3 block text-3xl text-[#0a8f4a]">layers</span>
        <p class="text-lg font-bold">模板</p>
        <p class="mt-1 text-sm text-[#7c8a84]">浏览计划模板（即将接入）</p>
      </router-link>

      <router-link
        to="/archive"
        class="rounded-2xl border border-[#e6ebe8] bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        data-testid="dash-card-archive"
      >
        <span class="material-symbols-outlined mb-3 block text-3xl text-[#0a8f4a]">inventory_2</span>
        <p class="text-lg font-bold">归档</p>
        <p class="mt-1 text-sm text-[#7c8a84]">已结束计划的集中入口</p>
      </router-link>

      <router-link
        to="/insights"
        class="rounded-2xl border border-[#e6ebe8] bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        data-testid="dash-card-insights"
      >
        <span class="material-symbols-outlined mb-3 block text-3xl text-[#0a8f4a]">bar_chart</span>
        <p class="text-lg font-bold">统计分析</p>
        <p class="mt-1 text-sm text-[#7c8a84]">完成率与任务指标（占位）</p>
      </router-link>

      <router-link
        to="/notifications"
        class="rounded-2xl border border-[#e6ebe8] bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        data-testid="dash-card-notifications"
      >
        <span class="material-symbols-outlined mb-3 block text-3xl text-[#0a8f4a]">notifications</span>
        <p class="text-lg font-bold">通知中心</p>
        <p class="mt-1 text-sm text-[#7c8a84]">提醒与系统消息</p>
      </router-link>

      <button
        type="button"
        class="rounded-2xl border border-dashed border-[#c5cfc9] bg-[#fafcfb] p-6 text-left transition hover:border-primary/50"
        data-testid="dash-card-pro"
        @click="router.push({ path: '/settings', query: { focus: 'pro' } })"
      >
        <span class="material-symbols-outlined mb-3 block text-3xl text-[#b8860b]">workspace_premium</span>
        <p class="text-lg font-bold">专业版</p>
        <p class="mt-1 text-sm text-[#7c8a84]">了解会员能力与开通方式</p>
      </button>
    </div>
  </div>
</template>
