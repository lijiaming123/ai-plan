<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import UiErrorToast from '../../components/UiErrorToast.vue';
import { getApiClient, type PlanRecord } from '../../lib/api-client';
import { authState } from '../../stores/auth';

type DiffResult = {
  baseVersion: number;
  targetVersion: number;
  addedStages: string[];
  removedStages: string[];
  addedTasks: string[];
  removedTasks: string[];
};

const route = useRoute();
const planId = computed(() => String(route.params.id ?? ''));
const loading = ref(false);
const operating = ref(false);
const plan = ref<PlanRecord | null>(null);
const selectedVersion = ref(1);
const compareBase = ref(1);
const compareTarget = ref(1);
const compareResult = ref<DiffResult | null>(null);
const errorToastMessage = ref('');

const versions = computed(() => plan.value?.draft?.versions ?? []);
const selectedSnapshot = computed(
  () => versions.value.find((version) => version.version === selectedVersion.value) ?? versions.value[0] ?? null
);
const draftMeta = computed(() => plan.value?.draft ?? null);
const remainingRegenerateCount = computed(() => {
  if (!draftMeta.value) return 0;
  return Math.max(draftMeta.value.maxVersions - draftMeta.value.versions.length, 0);
});
const isConfirmed = computed(() => draftMeta.value?.confirmedVersion !== null);
const canRegenerate = computed(() => Boolean(draftMeta.value?.canRegenerate));

const taskRows = computed(() => {
  if (!selectedSnapshot.value) return [];
  return selectedSnapshot.value.stages.flatMap((stage) =>
    stage.tasks.map((task) => ({
      key: `${stage.sortOrder}-${task.id}`,
      period: `阶段 ${stage.sortOrder}`,
      content: task.title,
      stage: stage.name,
      status: '待执行',
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
  compareResult.value = null;
  try {
    const data = await getApiClient().getPlan({
      id: planId.value,
      token: authState.token,
    });
    plan.value = data;
    const versionsLocal = data.draft?.versions ?? [];
    const latestVersion = versionsLocal.length ? versionsLocal[versionsLocal.length - 1].version : 1;
    selectedVersion.value = data.draft?.confirmedVersion ?? latestVersion;
    compareBase.value = versionsLocal[0]?.version ?? 1;
    compareTarget.value = latestVersion;
  } catch (error) {
    showError(error instanceof Error ? error.message : '加载计划详情失败');
  } finally {
    loading.value = false;
  }
}

async function handleRegenerate() {
  if (!canRegenerate.value || operating.value) return;
  operating.value = true;
  try {
    await getApiClient().regeneratePlan({
      id: planId.value,
      token: authState.token,
      requirement: selectedSnapshot.value?.requirement,
    });
    await loadPlanDetail();
  } catch (error) {
    showError(error instanceof Error ? error.message : '重新生成失败');
  } finally {
    operating.value = false;
  }
}

async function handleConfirmSelectedVersion() {
  if (operating.value || !selectedSnapshot.value) return;
  operating.value = true;
  try {
    await getApiClient().confirmPlan({
      id: planId.value,
      token: authState.token,
      version: selectedSnapshot.value.version,
    });
    await loadPlanDetail();
  } catch (error) {
    showError(error instanceof Error ? error.message : '确认版本失败');
  } finally {
    operating.value = false;
  }
}

async function handleCompare() {
  if (operating.value) return;
  operating.value = true;
  try {
    compareResult.value = await getApiClient().comparePlanVersions({
      id: planId.value,
      token: authState.token,
      base: compareBase.value,
      target: compareTarget.value,
    });
  } catch (error) {
    showError(error instanceof Error ? error.message : '版本比对失败');
  } finally {
    operating.value = false;
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
          <div class="size-10 rounded-full bg-cover bg-center" style="background-image: url('https://images.unsplash.com/photo-1633332755192-727a05c4013d?auto=format&fit=crop&w=120&q=80')" />
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
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="min-w-72">
              <p class="text-3xl font-black tracking-[-0.03em]">{{ plan?.goal ?? '计划详情' }}</p>
              <p class="mt-2 text-sm text-[#61896f]">
                状态：{{ plan?.status === 'active' ? '已确认' : '草稿待确认' }} · 当前版本 v{{ selectedSnapshot?.version ?? 1 }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                class="inline-flex h-10 items-center justify-center rounded-lg border border-[#d5e2db] bg-white px-4 text-sm font-bold transition hover:bg-[#f0f4f2] disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="!canRegenerate || operating || loading"
                @click="handleRegenerate"
              >
                重新生成（剩余 {{ remainingRegenerateCount }} 次）
              </button>
              <button
                class="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-bold text-[#111813] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="isConfirmed || operating || loading || !selectedSnapshot"
                @click="handleConfirmSelectedVersion"
              >
                {{ isConfirmed ? '已确认最终版' : `确认 v${selectedSnapshot?.version ?? 1} 为最终版` }}
              </button>
            </div>
          </div>
        </section>

        <section class="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="text-base font-bold">版本选择</h3>
            <p class="text-xs text-[#61896f]">最多保留 3 个生成版本，确认后将锁定生成</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="version in versions"
              :key="version.version"
              type="button"
              class="rounded-lg border px-3 py-1.5 text-sm font-semibold transition"
              :class="
                selectedVersion === version.version
                  ? 'border-[#0f8b4e] bg-[#eaf8f0] text-[#0f8b4e]'
                  : 'border-[#d5e2db] bg-white text-[#41534a] hover:bg-[#f4f8f6]'
              "
              @click="selectedVersion = version.version"
            >
              v{{ version.version }}
              <span v-if="draftMeta?.confirmedVersion === version.version">（已确认）</span>
            </button>
          </div>
          <div v-if="selectedSnapshot" class="mt-4 rounded-lg border border-[#e3ece7] bg-[#f8fbfa] p-4 text-sm leading-6 text-[#2a3832]">
            <p class="mb-2 font-semibold text-[#203029]">版本说明</p>
            <p class="whitespace-pre-wrap">{{ selectedSnapshot.requirement }}</p>
          </div>
        </section>

        <section class="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <h3 class="mr-3 text-base font-bold">版本比对</h3>
            <select v-model.number="compareBase" class="h-9 rounded-md border border-[#d5e2db] px-2 text-sm">
              <option v-for="version in versions" :key="`base-${version.version}`" :value="version.version">基准 v{{ version.version }}</option>
            </select>
            <select v-model.number="compareTarget" class="h-9 rounded-md border border-[#d5e2db] px-2 text-sm">
              <option v-for="version in versions" :key="`target-${version.version}`" :value="version.version">目标 v{{ version.version }}</option>
            </select>
            <button
              type="button"
              class="rounded-md border border-[#d5e2db] bg-white px-3 py-1.5 text-sm font-semibold hover:bg-[#f0f4f2] disabled:opacity-60"
              :disabled="operating || loading || versions.length < 2"
              @click="handleCompare"
            >
              生成比对
            </button>
          </div>
          <div v-if="compareResult" class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div class="rounded-lg border border-[#e3ece7] bg-[#f8fbfa] p-3">
              <p class="mb-2 text-sm font-bold text-[#1f2f28]">新增</p>
              <p class="text-xs font-semibold text-[#466257]">阶段：{{ compareResult.addedStages.length }} 项</p>
              <p class="text-xs font-semibold text-[#466257]">任务：{{ compareResult.addedTasks.length }} 项</p>
            </div>
            <div class="rounded-lg border border-[#eee2e1] bg-[#fff8f7] p-3">
              <p class="mb-2 text-sm font-bold text-[#5e3530]">减少</p>
              <p class="text-xs font-semibold text-[#6e4a45]">阶段：{{ compareResult.removedStages.length }} 项</p>
              <p class="text-xs font-semibold text-[#6e4a45]">任务：{{ compareResult.removedTasks.length }} 项</p>
            </div>
          </div>
          <p v-else class="text-sm text-[#61896f]">选择两个版本后点击“生成比对”。</p>
        </section>

        <section class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table class="w-full text-left text-sm">
            <thead class="bg-[#f6f8f6] text-xs uppercase text-[#61896f]">
              <tr>
                <th class="px-6 py-3 font-medium">阶段</th>
                <th class="px-6 py-3 font-medium">任务内容</th>
                <th class="px-6 py-3 font-medium">版本</th>
                <th class="px-6 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="4" class="px-6 py-6 text-center text-sm text-[#61896f]">加载中...</td>
              </tr>
              <tr v-else-if="!taskRows.length">
                <td colspan="4" class="px-6 py-6 text-center text-sm text-[#61896f]">暂无任务，请先生成版本</td>
              </tr>
              <tr v-for="task in taskRows" :key="task.key" class="border-b border-slate-200">
                <td class="whitespace-nowrap px-6 py-4 font-medium">{{ task.period }} · {{ task.stage }}</td>
                <td class="px-6 py-4">{{ task.content }}</td>
                <td class="px-6 py-4">v{{ selectedSnapshot?.version }}</td>
                <td class="px-6 py-4 text-right">
                  <router-link class="rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-semibold text-[#111813]" to="/tasks/demo-task/submit">
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
