<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import UiErrorToast from '../../components/UiErrorToast.vue';
import { getApiClient, type PlanRecord } from '../../lib/api-client';
import { authState } from '../../stores/auth';

const route = useRoute();
const planId = computed(() => String(route.params.id ?? ''));
const loading = ref(false);
const plan = ref<PlanRecord | null>(null);
const errorToastMessage = ref('');

const isDraft = computed(() => plan.value?.status === 'draft');

const executionSnapshot = computed(() => {
  const d = plan.value?.draft;
  if (!d?.versions?.length) return null;
  const confirmed = d.confirmedVersion;
  if (confirmed != null) {
    return d.versions.find((v) => v.version === confirmed) ?? d.versions[0];
  }
  return d.versions[d.versions.length - 1];
});

const taskRows = computed(() => {
  if (isDraft.value) return [];
  if (!executionSnapshot.value) return [];
  return executionSnapshot.value.stages.flatMap((stage) =>
    stage.tasks.map((task) => ({
      key: `${stage.sortOrder}-${task.id}`,
      taskId: task.id,
      period: `阶段 ${stage.sortOrder}`,
      stage: stage.name,
      content: task.title,
    }))
  );
});

function showError(message: string) {
  errorToastMessage.value = message;
}

function clearError() {
  errorToastMessage.value = '';
}

async function loadPlanDetail() {
  loading.value = true;
  try {
    plan.value = await getApiClient().getPlan({
      id: planId.value,
      token: authState.token,
    });
  } catch (error) {
    showError(error instanceof Error ? error.message : '加载计划详情失败');
  } finally {
    loading.value = false;
  }
}

onMounted(loadPlanDetail);
watch(
  () => route.params.id,
  () => {
    void loadPlanDetail();
  }
);
</script>

<template>
  <div class="flex min-h-screen w-full flex-row bg-background-light font-display text-[#111813]">
    <UiErrorToast :message="errorToastMessage" @close="clearError" />

    <aside class="hidden min-h-screen w-64 shrink-0 flex-col justify-between border-r border-slate-200 bg-white p-4 lg:flex">
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-3">
          <div
            class="size-10 rounded-full bg-cover bg-center"
            style="background-image: url('https://images.unsplash.com/photo-1633332755192-727a05c4013d?auto=format&fit=crop&w=120&q=80')"
          />
          <div class="flex flex-col">
            <h1 class="text-base font-medium">张伟</h1>
            <p class="text-sm text-[#61896f]">zhang.wei@example.com</p>
          </div>
        </div>
        <nav class="flex flex-col gap-2">
          <router-link class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-[#f0f4f2]" to="/plans">
            <span class="material-symbols-outlined text-base">dashboard</span>
            我的计划
          </router-link>
          <a class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-[#f0f4f2]">
            <span class="material-symbols-outlined text-base">grid_view</span>
            模板
          </a>
        </nav>
      </div>
      <router-link to="/plans/new" class="flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-bold text-[#111813]">
        创建新计划
      </router-link>
    </aside>

    <main class="flex-1 overflow-y-auto p-8">
      <div class="mx-auto max-w-5xl">
        <div class="mb-6 flex flex-wrap gap-2">
          <router-link to="/plans" class="text-base font-medium text-[#61896f]">我的计划</router-link>
          <span class="text-base font-medium text-[#61896f]">/</span>
          <span class="text-base font-medium">计划 {{ planId }}</span>
        </div>

        <section class="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p class="text-3xl font-black tracking-[-0.03em]">{{ plan?.goal ?? '计划详情' }}</p>
          <p class="mt-2 text-sm text-[#61896f]">
            状态：{{ plan?.status === 'active' ? '执行中' : '草稿' }}
            <span v-if="plan?.deadline"> · 截止 {{ plan.deadline }}</span>
          </p>
          <p v-if="plan?.requirement && plan.status === 'active'" class="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-[#2a3832]">
            {{ plan.requirement }}
          </p>
        </section>

        <section
          v-if="isDraft"
          class="mb-6 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950"
          data-testid="plan-detail-draft-banner"
        >
          <p class="font-bold">该计划仍处于草稿阶段</p>
          <p class="mt-1 text-amber-900/90">请前往草稿页对比版本并确认后，再开始执行任务。</p>
          <router-link
            :to="`/plans/${planId}/draft`"
            class="mt-3 inline-flex h-9 items-center rounded-lg bg-amber-600 px-4 text-sm font-bold text-white hover:bg-amber-700"
          >
            前往草稿确认
          </router-link>
        </section>

        <section class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <div class="border-b border-slate-100 px-6 py-4">
            <h2 class="text-base font-bold">任务清单</h2>
            <p class="text-xs text-[#61896f]">在任务页提交执行记录</p>
          </div>
          <table class="w-full text-left text-sm">
            <thead class="bg-[#f6f8f6] text-xs uppercase text-[#61896f]">
              <tr>
                <th class="px-6 py-3 font-medium">阶段</th>
                <th class="px-6 py-3 font-medium">任务</th>
                <th class="px-6 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="3" class="px-6 py-6 text-center text-sm text-[#61896f]">加载中...</td>
              </tr>
              <tr v-else-if="!taskRows.length">
                <td colspan="3" class="px-6 py-6 text-center text-sm text-[#61896f]">
                  {{ isDraft ? '确认草稿后将显示可执行任务' : '暂无任务' }}
                </td>
              </tr>
              <tr v-for="task in taskRows" :key="task.key" class="border-b border-slate-200">
                <td class="whitespace-nowrap px-6 py-4 font-medium">{{ task.period }} · {{ task.stage }}</td>
                <td class="px-6 py-4">{{ task.content }}</td>
                <td class="px-6 py-4 text-right">
                  <router-link
                    class="rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-semibold text-[#111813]"
                    :to="`/tasks/${task.taskId}/submit`"
                  >
                    提交
                  </router-link>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </main>
  </div>
</template>
