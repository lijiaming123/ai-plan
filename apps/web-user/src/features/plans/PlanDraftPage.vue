<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UiErrorToast from '../../components/UiErrorToast.vue';
import { getApiClient, type PlanRecord } from '../../lib/api-client';
import { authState } from '../../stores/auth';

type DraftBundle = NonNullable<PlanRecord['draft']>;

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

/** 递增序号，丢弃过期的异步回写（路由/planId 快速切换时） */
let loadDraftSeq = 0;

const versions = computed(() => draftMeta.value?.versions ?? []);
const selectedSnapshot = computed(
  () => versions.value.find((v) => v.version === selectedVersion.value) ?? versions.value[versions.value.length - 1] ?? null
);

const remainingRegenerateCount = computed(() => {
  if (!draftMeta.value) return 0;
  return Math.max(draftMeta.value.maxVersions - draftMeta.value.versions.length, 0);
});

const canRegenerate = computed(() => Boolean(draftMeta.value?.canRegenerate));

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
  operating.value = true;
  clearError();
  try {
    const result = await getApiClient().regeneratePlan({
      id: planId.value,
      token: authState.token,
      requirement: selectedSnapshot.value.requirement,
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
  } catch (error) {
    showError(error instanceof Error ? error.message : '重新生成失败');
  } finally {
    operating.value = false;
  }
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

onMounted(() => {
  void loadDraftPage();
});

watch(
  () => route.params.id,
  () => {
    void loadDraftPage();
  }
);
</script>

<template>
  <div class="flex min-h-screen w-full flex-col bg-background-light font-display text-[#111813]">
    <UiErrorToast :message="errorToastMessage" @close="clearError" />

    <header class="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-4 shadow-sm backdrop-blur md:px-8">
      <div class="mx-auto flex max-w-[1600px] flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div class="min-w-0">
          <div class="mb-1 flex flex-wrap items-center gap-2 text-sm text-[#61896f]">
            <router-link to="/plans" class="font-medium hover:text-[#203029]">我的计划</router-link>
            <span>/</span>
            <span class="font-mono text-xs">草稿</span>
          </div>
          <h1 class="truncate text-2xl font-black tracking-tight md:text-3xl">{{ planGoal || '计划草稿' }}</h1>
          <p class="mt-1 text-sm text-[#61896f]">状态：草稿待确认 · 已生成 {{ versions.length }} 个版本</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="inline-flex h-10 items-center justify-center rounded-lg border border-[#d5e2db] bg-white px-4 text-sm font-bold transition hover:bg-[#f0f4f2] disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="!canRegenerate || operating || loading"
            data-testid="draft-regenerate"
            @click="handleRegenerate"
          >
            重新生成（剩余 {{ remainingRegenerateCount }} 次）
          </button>
          <button
            type="button"
            class="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-bold text-[#111813] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
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

    <main class="flex-1 px-4 py-6 md:px-8">
      <div v-if="loading" class="py-16 text-center text-sm text-[#61896f]">加载草稿中…</div>

      <div v-else class="mx-auto max-w-[1600px]">
        <!-- 桌面：并排卡片 + 横向滚动 -->
        <div class="hidden gap-4 overflow-x-auto pb-2 md:flex md:flex-nowrap">
          <button
            v-for="ver in versions"
            :key="ver.version"
            type="button"
            class="flex w-[min(100%,22rem)] shrink-0 flex-col rounded-xl border-2 bg-white text-left shadow-sm transition hover:border-[#9cc4b0]"
            :class="
              selectedVersion === ver.version ? 'border-[#0f8b4e] ring-2 ring-[#0f8b4e]/25' : 'border-slate-200'
            "
            :data-testid="`draft-card-v${ver.version}`"
            @click="selectVersion(ver.version)"
          >
            <div class="border-b border-slate-100 px-4 py-3">
              <p class="text-lg font-black">v{{ ver.version }}</p>
              <p class="text-xs text-[#61896f]">{{ formatCreatedAt(ver.createdAt) }}</p>
            </div>
            <div class="max-h-[min(70vh,36rem)] flex-1 overflow-y-auto px-4 py-3">
              <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-[#61896f]">版本说明</p>
              <p class="mb-4 whitespace-pre-wrap text-sm leading-relaxed text-[#2a3832]">{{ ver.requirement }}</p>
              <div v-for="stage in ver.stages" :key="`${ver.version}-${stage.sortOrder}`" class="mb-4 last:mb-0">
                <p class="mb-2 text-sm font-bold text-[#203029]">阶段 {{ stage.sortOrder }} · {{ stage.name }}</p>
                <ul class="space-y-2 text-sm text-[#41534a]">
                  <li v-for="task in stage.tasks" :key="task.id" class="rounded-md bg-[#f4f8f6] px-3 py-2">
                    {{ task.title }}
                  </li>
                </ul>
              </div>
            </div>
          </button>
        </div>

        <!-- 小屏：单列当前版本 -->
        <div v-if="selectedSnapshot" class="md:hidden">
          <article
            class="flex flex-col rounded-xl border-2 border-[#0f8b4e] bg-white shadow-sm ring-2 ring-[#0f8b4e]/20"
            :data-testid="`draft-card-v${selectedSnapshot.version}`"
          >
            <div class="border-b border-slate-100 px-4 py-3">
              <p class="text-lg font-black">v{{ selectedSnapshot.version }}</p>
              <p class="text-xs text-[#61896f]">{{ formatCreatedAt(selectedSnapshot.createdAt) }}</p>
            </div>
            <div class="max-h-[min(70vh,36rem)] overflow-y-auto px-4 py-3">
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

        <p v-if="!loading && !versions.length" class="py-12 text-center text-sm text-[#61896f]">暂无草稿版本</p>
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
  </div>
</template>
