<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UiErrorToast from '../../components/UiErrorToast.vue';
import { getApiClient, type PlanRecord } from '../../lib/api-client';
import { authState } from '../../stores/auth';

type DraftBundle = NonNullable<PlanRecord['draft']>;
type GranularityMode = 'smart' | 'deep' | 'rough';
type VersionDiffMeta = {
  addedStages: number;
  removedStages: number;
  addedTasks: number;
  removedTasks: number;
  addedStageNames: Set<string>;
  addedTaskKeys: Set<string>;
};

const route = useRoute();
const router = useRouter();
const planId = computed(() => String(route.params.id ?? ''));

const loading = ref(false);
const operating = ref(false);
const planGoal = ref('');
const draftMeta = ref<DraftBundle | null>(null);
const selectedVersion = ref(1);
const errorToastMessage = ref('');
const confirmOpen = ref(false);
const confirmModalError = ref('');
const nextGranularityMode = ref<GranularityMode>('smart');
const granularityConfirmOpen = ref(false);

/** 递增序号，丢弃过期的异步回写（路由/planId 快速切换时） */
let loadDraftSeq = 0;

const versions = computed(() => draftMeta.value?.versions ?? []);
const selectedSnapshot = computed(
  () => versions.value.find((v) => v.version === selectedVersion.value) ?? versions.value[versions.value.length - 1] ?? null
);
const selectedTaskCount = computed(() =>
  selectedSnapshot.value ? selectedSnapshot.value.stages.reduce((sum, stage) => sum + stage.tasks.length, 0) : 0
);
const totalTaskCount = computed(() =>
  versions.value.reduce((versionSum, version) => {
    return versionSum + version.stages.reduce((stageSum, stage) => stageSum + stage.tasks.length, 0);
  }, 0)
);
const versionDiffMetaMap = computed(() => {
  const map = new Map<number, VersionDiffMeta>();
  versions.value.forEach((version, index) => {
    if (index === 0) {
      map.set(version.version, {
        addedStages: 0,
        removedStages: 0,
        addedTasks: 0,
        removedTasks: 0,
        addedStageNames: new Set<string>(),
        addedTaskKeys: new Set<string>(),
      });
      return;
    }
    const prev = versions.value[index - 1];
    const currentStageNames = new Set(version.stages.map((stage) => stage.name));
    const previousStageNames = new Set(prev.stages.map((stage) => stage.name));
    const addedStageNames = new Set([...currentStageNames].filter((name) => !previousStageNames.has(name)));
    const removedStageCount = [...previousStageNames].filter((name) => !currentStageNames.has(name)).length;

    const toTaskKey = (stageName: string, taskTitle: string) => `${stageName}::${taskTitle}`;
    const currentTaskKeys = new Set(version.stages.flatMap((stage) => stage.tasks.map((task) => toTaskKey(stage.name, task.title))));
    const previousTaskKeys = new Set(prev.stages.flatMap((stage) => stage.tasks.map((task) => toTaskKey(stage.name, task.title))));
    const addedTaskKeys = new Set([...currentTaskKeys].filter((key) => !previousTaskKeys.has(key)));
    const removedTaskCount = [...previousTaskKeys].filter((key) => !currentTaskKeys.has(key)).length;

    map.set(version.version, {
      addedStages: addedStageNames.size,
      removedStages: removedStageCount,
      addedTasks: addedTaskKeys.size,
      removedTasks: removedTaskCount,
      addedStageNames,
      addedTaskKeys,
    });
  });
  return map;
});
const selectedDiffMeta = computed(() => {
  if (!selectedSnapshot.value) return null;
  return versionDiffMetaMap.value.get(selectedSnapshot.value.version) ?? null;
});

const remainingRegenerateCount = computed(() => {
  if (!draftMeta.value) return 0;
  return Math.max(draftMeta.value.maxVersions - draftMeta.value.versions.length, 0);
});

const canRegenerate = computed(() => Boolean(draftMeta.value?.canRegenerate));
const selectedGranularityMode = computed<GranularityMode>(() => {
  const snapshot = selectedSnapshot.value;
  if (!snapshot) return 'smart';
  const allTasks = snapshot.stages.flatMap((stage) => stage.tasks);
  if (allTasks.some((task) => task.taskType === 'monthly_summary' || task.taskType === 'weekly_summary')) return 'deep';
  if (allTasks.some((task) => task.timeSlotType === 'week')) return 'rough';
  return 'smart';
});

function showError(message: string) {
  errorToastMessage.value = message;
}

function clearError() {
  errorToastMessage.value = '';
}

function isDraftClosedError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return /\b409\b/.test(msg) && /draft is closed/i.test(msg);
}

async function goToDetail(targetId: string) {
  await router.replace({ name: 'plan-detail', params: { id: targetId } });
}

async function loadDraftPage() {
  const seq = ++loadDraftSeq;
  const id = planId.value;
  loading.value = true;
  clearError();
  draftMeta.value = null;
  planGoal.value = '';
  selectedVersion.value = 1;
  confirmOpen.value = false;
  confirmModalError.value = '';
  try {
    const plan = await getApiClient().getPlan({
      id,
      token: authState.token,
    });
    if (seq !== loadDraftSeq) return;
    planGoal.value = plan.goal;
    if (plan.status === 'active') {
      if (seq !== loadDraftSeq) return;
      await goToDetail(id);
      return;
    }
    draftMeta.value = null;
    const draft = await getApiClient().getPlanDraft({
      id,
      token: authState.token,
    });
    if (seq !== loadDraftSeq) return;
    draftMeta.value = draft;
    const latest = draft.versions.length ? draft.versions[draft.versions.length - 1].version : 1;
    selectedVersion.value = draft.confirmedVersion ?? latest;
    nextGranularityMode.value = selectedGranularityMode.value;
  } catch (error) {
    if (seq !== loadDraftSeq) return;
    if (isDraftClosedError(error)) {
      if (seq !== loadDraftSeq) return;
      await goToDetail(id);
      return;
    }
    showError(error instanceof Error ? error.message : '加载草稿失败');
  } finally {
    if (seq === loadDraftSeq) {
      loading.value = false;
    }
  }
}

function selectVersion(version: number) {
  selectedVersion.value = version;
}

async function handleRegenerate() {
  if (!canRegenerate.value || operating.value || !selectedSnapshot.value) return;
  if (nextGranularityMode.value !== selectedGranularityMode.value) {
    granularityConfirmOpen.value = true;
    return;
  }
  await submitRegenerate();
}

async function submitRegenerate() {
  if (!canRegenerate.value || operating.value || !selectedSnapshot.value) return;
  operating.value = true;
  clearError();
  try {
    const result = await getApiClient().regeneratePlan({
      id: planId.value,
      token: authState.token,
      requirement: selectedSnapshot.value.requirement,
      granularityMode: nextGranularityMode.value,
    });
    if (!draftMeta.value) return;
    draftMeta.value = {
      ...draftMeta.value,
      versions: result.versions,
      maxVersions: result.maxVersions,
      confirmedVersion: result.confirmedVersion,
      canRegenerate: result.canRegenerate,
    };
    const latest = result.versions.length ? result.versions[result.versions.length - 1].version : 1;
    selectedVersion.value = latest;
    nextGranularityMode.value = selectedGranularityMode.value;
  } catch (error) {
    showError(error instanceof Error ? error.message : '重新生成失败');
  } finally {
    operating.value = false;
  }
}

function closeGranularityConfirmModal() {
  if (operating.value) return;
  granularityConfirmOpen.value = false;
}

async function submitGranularitySwitch() {
  if (operating.value) return;
  granularityConfirmOpen.value = false;
  await submitRegenerate();
}

function openConfirmModal() {
  if (!selectedSnapshot.value || operating.value) return;
  confirmModalError.value = '';
  confirmOpen.value = true;
}

function closeConfirmModal() {
  if (operating.value) return;
  confirmOpen.value = false;
  confirmModalError.value = '';
  granularityConfirmOpen.value = false;
}

async function submitConfirm() {
  if (!selectedSnapshot.value || operating.value) return;
  operating.value = true;
  confirmModalError.value = '';
  try {
    await getApiClient().confirmPlan({
      id: planId.value,
      token: authState.token,
      version: selectedSnapshot.value.version,
    });
    confirmOpen.value = false;
    await router.push({ name: 'plan-detail', params: { id: planId.value } });
  } catch (error) {
    confirmModalError.value = error instanceof Error ? error.message : '确认失败';
  } finally {
    operating.value = false;
  }
}

function formatCreatedAt(iso: string) {
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  } catch {
    return iso;
  }
}

function getDiffMeta(version: number): VersionDiffMeta | null {
  return versionDiffMetaMap.value.get(version) ?? null;
}

function isAddedStage(version: number, stageName: string) {
  return getDiffMeta(version)?.addedStageNames.has(stageName) ?? false;
}

function isAddedTask(version: number, stageName: string, taskTitle: string) {
  return getDiffMeta(version)?.addedTaskKeys.has(`${stageName}::${taskTitle}`) ?? false;
}

onMounted(() => {
  void loadDraftPage();
});

watch(
  () => route.params.id,
  () => {
    void loadDraftPage();
  }
);

watch(
  selectedGranularityMode,
  (value) => {
    nextGranularityMode.value = value;
  },
  { immediate: true }
);
</script>

<template>
  <div class="flex h-screen w-full flex-col overflow-hidden bg-[linear-gradient(180deg,#f6faf8_0%,#eef5f1_42%,#edf3ef_100%)] font-display text-[#111813]">
    <UiErrorToast :message="errorToastMessage" @close="clearError" />

    <header class="sticky top-0 z-20 border-b border-[#d8e6df] bg-white/95 px-4 py-4 shadow-sm backdrop-blur md:px-8">
      <div class="mx-auto flex max-w-[1600px] flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div class="min-w-0">
          <div class="mb-2 flex flex-wrap items-center gap-2 text-sm text-[#5f7d70]">
            <router-link to="/plans" class="font-semibold hover:text-[#203029]">我的计划</router-link>
            <span>/</span>
            <span class="rounded-md bg-[#edf5f1] px-2 py-0.5 font-mono text-xs font-bold text-[#35624f]">草稿中心</span>
          </div>
          <h1 class="truncate text-2xl font-black tracking-tight text-[#17251f] md:text-3xl">{{ planGoal || '计划草稿' }}</h1>
          <div class="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span class="rounded-full bg-[#eaf7f0] px-3 py-1 text-[#0f8b4e]">草稿待确认</span>
            <span class="rounded-full bg-white px-3 py-1 text-[#486255] ring-1 ring-[#dbe8e2]">版本数 {{ versions.length }}</span>
            <span class="rounded-full bg-white px-3 py-1 text-[#486255] ring-1 ring-[#dbe8e2]">总任务 {{ totalTaskCount }}</span>
            <span class="rounded-full bg-white px-3 py-1 text-[#486255] ring-1 ring-[#dbe8e2]">当前任务 {{ selectedTaskCount }}</span>
            <span
              v-if="selectedSnapshot && selectedSnapshot.version !== versions[0]?.version && selectedDiffMeta"
              class="rounded-full bg-[#edf8f2] px-3 py-1 text-[#35624f] ring-1 ring-[#d3e8dd]"
            >
              对比上一版：+{{ selectedDiffMeta.addedTasks }} / -{{ selectedDiffMeta.removedTasks }} 任务
            </span>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <div class="inline-flex items-center gap-2 rounded-lg border border-[#d5e2db] bg-white px-3 py-2">
            <label for="granularity-mode" class="text-xs font-semibold text-[#466257]">颗粒度</label>
            <select
              id="granularity-mode"
              v-model="nextGranularityMode"
              class="h-7 rounded border border-[#d5e2db] bg-white px-2 text-xs font-semibold text-[#203029]"
              data-testid="draft-granularity-mode"
            >
              <option value="smart">智能推荐</option>
              <option value="deep">深度计划</option>
              <option value="rough">粗略计划</option>
            </select>
          </div>
          <button
            type="button"
            class="inline-flex h-10 items-center justify-center rounded-lg border border-[#c8ddd1] bg-white px-4 text-sm font-bold text-[#244236] transition duration-200 hover:-translate-y-0.5 hover:bg-[#f3f8f5] hover:shadow-[0_6px_14px_rgba(25,55,43,0.12)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="!canRegenerate || operating || loading"
            data-testid="draft-regenerate"
            @click="handleRegenerate"
          >
            重新生成（剩余 {{ remainingRegenerateCount }} 次）
          </button>
          <button
            type="button"
            class="inline-flex h-10 items-center justify-center rounded-lg bg-[linear-gradient(90deg,#12a65d,#0f8b4e)] px-4 text-sm font-bold text-white shadow-[0_6px_18px_rgba(15,139,78,0.28)] transition duration-200 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_10px_22px_rgba(15,139,78,0.34)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="!selectedSnapshot || operating || loading"
            data-testid="draft-open-confirm"
            @click="openConfirmModal"
          >
            确认 v{{ selectedSnapshot?.version ?? '—' }} 并保存
          </button>
        </div>
      </div>

      <!-- 小屏：顶部版本切换 -->
      <div class="mx-auto mt-4 max-w-[1600px] md:hidden">
        <label class="mb-1 block text-xs font-semibold text-[#466257]">当前查看版本</label>
        <select
          v-model.number="selectedVersion"
          class="h-10 w-full rounded-lg border border-[#d5e2db] bg-white px-3 text-sm font-semibold"
          data-testid="draft-version-select"
        >
          <option v-for="v in versions" :key="`m-${v.version}`" :value="v.version">v{{ v.version }}</option>
        </select>
      </div>
    </header>

    <main class="flex flex-1 flex-col overflow-hidden px-4 py-6 md:px-8">
      <div v-if="loading" class="py-16 text-center text-sm text-[#61896f]">加载草稿中…</div>

      <div v-else class="mx-auto flex h-full w-full max-w-[1600px] flex-col overflow-hidden">
        <!-- 桌面：并排卡片 + 横向滚动 -->
        <div
          class="hidden h-full auto-rows-fr gap-4 pb-3 md:grid"
          :style="{ gridTemplateColumns: `repeat(${Math.max(versions.length, 1)}, minmax(0, 1fr))` }"
        >
          <button
            v-for="ver in versions"
            :key="ver.version"
            type="button"
            class="group relative flex h-full min-w-0 flex-col rounded-2xl border bg-white/95 text-left shadow-[0_10px_22px_rgba(20,51,39,0.08)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(20,51,39,0.14)]"
            :class="
              selectedVersion === ver.version
                ? 'border-[#0f8b4e] ring-2 ring-[#0f8b4e]/25 draft-card-active'
                : 'border-[#dbe6e0] hover:border-[#a8cab8]'
            "
            :data-testid="`draft-card-v${ver.version}`"
            @click="selectVersion(ver.version)"
          >
            <div class="sticky top-0 z-10 rounded-t-2xl border-b border-[#e6efea] bg-[linear-gradient(180deg,#fbfffd_0%,#f4fbf7_100%)] px-4 py-3">
              <div class="flex items-center justify-between">
                <p class="text-lg font-black text-[#163025]">v{{ ver.version }}</p>
                <span
                  class="rounded-full px-2 py-0.5 text-[11px] font-bold"
                  :class="
                    selectedVersion === ver.version ? 'bg-[#dff5e8] text-[#0f8b4e]' : 'bg-[#eef4f1] text-[#5d786b]'
                  "
                >
                  {{ selectedVersion === ver.version ? '当前选中' : '待评估' }}
                </span>
              </div>
              <p class="mt-1 text-xs font-medium text-[#61896f]">{{ formatCreatedAt(ver.createdAt) }}</p>
              <div class="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold">
                <template v-if="ver.version === versions[0]?.version">
                  <span class="rounded-full bg-[#edf4f0] px-2 py-0.5 text-[#5d786b]">基线版本</span>
                </template>
                <template v-else>
                  <span class="rounded-full bg-[#e8f7ee] px-2 py-0.5 text-[#0f8b4e]">+阶段 {{ getDiffMeta(ver.version)?.addedStages ?? 0 }}</span>
                  <span class="rounded-full bg-[#e8f7ee] px-2 py-0.5 text-[#0f8b4e]">+任务 {{ getDiffMeta(ver.version)?.addedTasks ?? 0 }}</span>
                  <span class="rounded-full bg-[#fff4f2] px-2 py-0.5 text-[#a34e45]">-阶段 {{ getDiffMeta(ver.version)?.removedStages ?? 0 }}</span>
                  <span class="rounded-full bg-[#fff4f2] px-2 py-0.5 text-[#a34e45]">-任务 {{ getDiffMeta(ver.version)?.removedTasks ?? 0 }}</span>
                </template>
              </div>
            </div>
            <div class="draft-card-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <div class="mb-4 rounded-xl border border-[#e5efea] bg-[#f8fcfa] p-3">
                <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#61896f]">版本说明</p>
                <p class="whitespace-pre-wrap text-sm leading-relaxed text-[#2a3832]">{{ ver.requirement }}</p>
              </div>
              <div v-for="stage in ver.stages" :key="`${ver.version}-${stage.sortOrder}`" class="mb-4 last:mb-0">
                <p class="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#203029]">
                  <span>阶段 {{ stage.sortOrder }} · {{ stage.name }}</span>
                  <span v-if="isAddedStage(ver.version, stage.name)" class="rounded-full bg-[#e8f7ee] px-2 py-0.5 text-[10px] font-bold text-[#0f8b4e]">
                    新增阶段
                  </span>
                </p>
                <ul class="space-y-2 text-sm text-[#41534a]">
                  <li
                    v-for="task in stage.tasks"
                    :key="task.id"
                    class="rounded-lg border border-[#e2ece7] bg-white px-3 py-2 leading-relaxed shadow-[inset_0_0_0_1px_#f1f6f3] transition duration-150 hover:border-[#c8ddd1] hover:bg-[#f8fcfa]"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <span>{{ task.title }}</span>
                      <span
                        v-if="isAddedTask(ver.version, stage.name, task.title)"
                        class="shrink-0 rounded-full bg-[#e8f7ee] px-2 py-0.5 text-[10px] font-bold text-[#0f8b4e]"
                      >
                        新增
                      </span>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </button>
        </div>

        <!-- 小屏：单列当前版本 -->
        <div v-if="selectedSnapshot" class="min-h-0 md:hidden">
          <article class="flex flex-col rounded-2xl border-2 border-[#0f8b4e] bg-white shadow-sm ring-2 ring-[#0f8b4e]/20" :data-testid="`draft-card-v${selectedSnapshot.version}`">
            <div class="border-b border-slate-100 px-4 py-3">
              <p class="text-lg font-black">v{{ selectedSnapshot.version }}</p>
              <p class="text-xs text-[#61896f]">{{ formatCreatedAt(selectedSnapshot.createdAt) }}</p>
            </div>
            <div class="max-h-[70vh] overflow-y-auto px-4 py-3">
              <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-[#61896f]">版本说明</p>
              <p class="mb-4 whitespace-pre-wrap text-sm leading-relaxed text-[#2a3832]">{{ selectedSnapshot.requirement }}</p>
              <div
                v-for="stage in selectedSnapshot.stages"
                :key="`${selectedSnapshot.version}-${stage.sortOrder}`"
                class="mb-4 last:mb-0"
              >
                <p class="mb-2 text-sm font-bold text-[#203029]">阶段 {{ stage.sortOrder }} · {{ stage.name }}</p>
                <ul class="space-y-2 text-sm text-[#41534a]">
                  <li v-for="task in stage.tasks" :key="task.id" class="rounded-md bg-[#f4f8f6] px-3 py-2">
                    {{ task.title }}
                  </li>
                </ul>
              </div>
            </div>
          </article>
        </div>

        <div v-if="!loading && !versions.length" class="mx-auto my-auto max-w-xl rounded-2xl border border-[#dbe6e0] bg-white/80 p-8 text-center shadow-sm">
          <p class="mb-2 text-base font-bold text-[#234236]">还没有可比较的草稿版本</p>
          <p class="text-sm text-[#61896f]">点击顶部“重新生成”创建新版本，或返回创建页完善输入信息。</p>
        </div>
      </div>
    </main>

    <!-- 二次确认 -->
    <Teleport to="body">
      <div
        v-if="confirmOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        data-testid="draft-confirm-modal"
        @click.self="closeConfirmModal"
      >
        <div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" role="dialog" aria-modal="true">
          <h2 class="text-lg font-black text-[#111813]">确认保存该版本？</h2>
          <p class="mt-2 text-sm leading-relaxed text-[#41534a]">
            确认后计划将进入执行阶段，当前选中的
            <span class="font-bold">v{{ selectedSnapshot?.version }}</span>
            将作为正式版本保存，此操作不可撤销。
          </p>
          <p v-if="confirmModalError" class="mt-3 text-sm font-medium text-red-700" data-testid="draft-confirm-error">{{ confirmModalError }}</p>
          <div class="mt-6 flex justify-end gap-2">
            <button
              type="button"
              class="h-10 rounded-lg border border-[#d5e2db] px-4 text-sm font-bold hover:bg-[#f4f8f6]"
              data-testid="draft-confirm-cancel"
              @click="closeConfirmModal"
            >
              取消
            </button>
            <button
              type="button"
              class="h-10 rounded-lg bg-primary px-4 text-sm font-bold text-[#111813] hover:brightness-95 disabled:opacity-60"
              data-testid="draft-confirm-submit"
              :disabled="operating"
              @click="submitConfirm"
            >
              {{ operating ? '提交中…' : '确认保存' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="granularityConfirmOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        data-testid="draft-granularity-confirm-modal"
        @click.self="closeGranularityConfirmModal"
      >
        <div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" role="dialog" aria-modal="true">
          <h2 class="text-lg font-black text-[#111813]">确认切换颗粒度并重新生成？</h2>
          <p class="mt-2 text-sm leading-relaxed text-[#41534a]">
            当前版本颗粒度为
            <span class="font-bold">{{ selectedGranularityMode }}</span>
            ，将切换为
            <span class="font-bold">{{ nextGranularityMode }}</span>
            并生成新的草稿版本。
          </p>
          <div class="mt-6 flex justify-end gap-2">
            <button
              type="button"
              class="h-10 rounded-lg border border-[#d5e2db] px-4 text-sm font-bold hover:bg-[#f4f8f6]"
              data-testid="draft-granularity-confirm-cancel"
              @click="closeGranularityConfirmModal"
            >
              取消
            </button>
            <button
              type="button"
              class="h-10 rounded-lg bg-primary px-4 text-sm font-bold text-[#111813] hover:brightness-95 disabled:opacity-60"
              data-testid="draft-granularity-confirm-submit"
              :disabled="operating"
              @click="submitGranularitySwitch"
            >
              {{ operating ? '生成中…' : '确认并生成' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.draft-card-scroll::-webkit-scrollbar {
  width: 8px;
  height: 10px;
}

.draft-card-scroll::-webkit-scrollbar-track {
  background: rgba(209, 223, 216, 0.38);
  border-radius: 9999px;
}

.draft-card-scroll::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #8eb4a2 0%, #6d9a86 100%);
  border-radius: 9999px;
}

.draft-card-scroll {
  scrollbar-color: #7ca590 rgba(209, 223, 216, 0.38);
  scrollbar-width: thin;
}

.draft-card-active::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 1rem;
  pointer-events: none;
  box-shadow: 0 0 0 0 rgba(15, 139, 78, 0.28);
  animation: draftCardPulse 2.2s ease-out infinite;
}

@keyframes draftCardPulse {
  0% {
    box-shadow: 0 0 0 0 rgba(15, 139, 78, 0.25);
  }
  70% {
    box-shadow: 0 0 0 12px rgba(15, 139, 78, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(15, 139, 78, 0);
  }
}
</style>
