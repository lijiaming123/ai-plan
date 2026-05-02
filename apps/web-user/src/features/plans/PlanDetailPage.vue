<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UiErrorToast from '../../components/UiErrorToast.vue';
import UiConfirmDialog from '../../components/UiConfirmDialog.vue';
import PlanPomodoroBar from '../../components/PlanPomodoroBar.vue';
import type { CheckinPublicReview, PlanRecord } from '../../lib/api-client';
import { getApiClient, HttpApiError } from '../../lib/api-client';
import { renderMarkdownToHtml } from '../../lib/render-markdown';
import { trackEvent } from '../../lib/telemetry';
import { useCloseOnEscape } from '../../composables/useCloseOnEscape';
import { authState } from '../../stores/auth';

const route = useRoute();
const router = useRouter();
const planId = computed(() => String(route.params.id ?? ''));
const loading = ref(false);
const plan = ref<PlanRecord | null>(null);
const errorToastMessage = ref('');
const showPublishForm = ref(false);
const publishSubmitting = ref(false);
const publishForm = ref({
  title: '',
  summary: '',
  category: 'general',
  tags: '' as string,
});

const isDraft = computed(() => plan.value?.status === 'draft');
const isArchived = computed(() => plan.value?.status === 'archived');

const breadcrumbTail = computed(() => {
  if (loading.value && !plan.value) return '加载中…';
  const g = plan.value?.goal?.trim();
  if (g) return g.length > 30 ? `${g.slice(0, 30)}…` : g;
  return `计划 ${planId.value}`;
});

const breadcrumbTailTitle = computed(() => plan.value?.goal?.trim() ?? '');

/** 详情页截止日：避免展示 ISO 原始串 */
function formatDetailDeadline(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const statusLabel = computed(() => {
  if (isArchived.value) return '已归档';
  const s = plan.value?.status;
  if (s === 'active') return '执行中';
  if (s === 'draft') return '草稿';
  return s ?? '';
});

const typeLabel = computed(() => {
  const t = (plan.value?.type ?? 'general').toLowerCase();
  const map: Record<string, string> = {
    general: '通用',
    study: '学习',
    work: '工作',
    exam: '考试',
    fitness: '运动',
    other: '其他',
  };
  return map[t] ?? plan.value?.type ?? '';
});

function renderRequirementMd(raw: string): string {
  return renderMarkdownToHtml(raw);
}

const canPublishTemplate = computed(() => {
  const p = plan.value;
  if (!p || !authState.token || !authState.userId) return false;
  if (p.userId && p.userId !== authState.userId) return false;
  if (isArchived.value) return false;
  return p.status === 'draft' || p.status === 'active';
});

function openPublishForm() {
  const p = plan.value;
  if (!p) return;
  publishForm.value = {
    title: p.goal.slice(0, 200),
    summary: p.requirement.slice(0, 5000),
    category: p.type === 'study' || p.type === 'work' ? p.type : 'general',
    tags: '',
  };
  showPublishForm.value = true;
}

async function submitPublishTemplate() {
  if (!plan.value || !authState.token) return;
  publishSubmitting.value = true;
  try {
    const tags = publishForm.value.tags
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const created = await getApiClient().publishMarketTemplate({
      token: authState.token,
      title: publishForm.value.title.trim(),
      summary: publishForm.value.summary.trim(),
      category: publishForm.value.category.trim() || 'general',
      tags,
      planId: plan.value.id,
    });
    trackEvent('template_publish', {
      properties: {
        planId: plan.value.id,
        templateId: created.id,
        category: publishForm.value.category.trim() || 'general',
      },
    });
    showPublishForm.value = false;
    await router.push({ path: '/templates', query: { published: '1' } });
  } catch (e) {
    showError(e instanceof Error ? e.message : '发布失败');
  } finally {
    publishSubmitting.value = false;
  }
}

const executionSnapshot = computed(() => {
  const d = plan.value?.draft;
  if (!d?.versions?.length) return null;
  const confirmed = d.confirmedVersion;
  if (confirmed != null) {
    return d.versions.find((v) => v.version === confirmed) ?? d.versions[0];
  }
  return d.versions[d.versions.length - 1];
});

const checkinSchedule = computed(() => executionSnapshot.value?.schedule ?? null);

const scheduleEditOpen = ref(false);
const scheduleEditSlotKey = ref('');
const scheduleEditContent = ref('');
const scheduleSaving = ref(false);

function openScheduleEdit(slotKey: string, content: string) {
  scheduleEditSlotKey.value = slotKey;
  scheduleEditContent.value = content;
  scheduleEditOpen.value = true;
}

async function saveScheduleEdit() {
  if (!authState.token) return;
  const slotKey = scheduleEditSlotKey.value;
  if (!slotKey) return;
  const draftPlanVersion =
    plan.value?.status === 'draft' && executionSnapshot.value ? executionSnapshot.value.version : undefined;
  scheduleSaving.value = true;
  try {
    const res = await getApiClient().patchPlanScheduleSlot({
      id: planId.value,
      slotKey,
      token: authState.token,
      content: scheduleEditContent.value,
      version: draftPlanVersion,
    });
    if (plan.value?.draft?.versions?.length && executionSnapshot.value) {
      const targetVersion = executionSnapshot.value.version;
      const idx = plan.value.draft.versions.findIndex((v) => v.version === targetVersion);
      if (idx >= 0) plan.value.draft.versions[idx] = { ...plan.value.draft.versions[idx], schedule: res.schedule };
    }
    scheduleEditOpen.value = false;
  } catch (e) {
    showError(e instanceof Error ? e.message : '保存失败');
  } finally {
    scheduleSaving.value = false;
  }
}

async function restoreScheduleSlot(slotKey: string) {
  if (!authState.token) return;
  const draftPlanVersion =
    plan.value?.status === 'draft' && executionSnapshot.value ? executionSnapshot.value.version : undefined;
  scheduleSaving.value = true;
  try {
    const res = await getApiClient().patchPlanScheduleSlot({
      id: planId.value,
      slotKey,
      token: authState.token,
      restore: true,
      version: draftPlanVersion,
    });
    if (plan.value?.draft?.versions?.length && executionSnapshot.value) {
      const targetVersion = executionSnapshot.value.version;
      const idx = plan.value.draft.versions.findIndex((v) => v.version === targetVersion);
      if (idx >= 0) plan.value.draft.versions[idx] = { ...plan.value.draft.versions[idx], schedule: res.schedule };
    }
  } catch (e) {
    showError(e instanceof Error ? e.message : '恢复失败');
  } finally {
    scheduleSaving.value = false;
  }
}

/** S1：超过截止时刻仍可操作，仅作提示 */
const isPastPlanDeadline = computed(() => {
  if (!plan.value?.deadline) return false;
  const t = new Date(plan.value.deadline).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() > t;
});

const canSubmitCheckin = computed(
  () =>
    !!authState.token &&
    !isDraft.value &&
    !isArchived.value &&
    plan.value?.status === 'active'
);

const confirmArchiveOpen = ref(false);
const archiveSubmitting = ref(false);

function slotSubmissions(slotKey: string) {
  return plan.value?.scheduleSlotSubmissions?.[slotKey] ?? [];
}

function slotSubmissionSummary(slotKey: string): string {
  const list = slotSubmissions(slotKey);
  if (list.length === 0) return '—';
  return `${list.length} 条记录`;
}

const checkinOpen = ref(false);
const checkinSlotKey = ref('');
/** 打开弹窗时带入的本期计划文案，便于对照填写 */
const checkinSlotPlanText = ref('');
const checkinContent = ref('');
/** 本地上传成功的附件（仅展示芯片，不出现在「手动链接」表格） */
const checkinUploadedFiles = ref<Array<{ url: string; fileName: string }>>([]);
/** 用户手填的外链行 */
const checkinManualLinks = ref<Array<{ url: string; fileName: string }>>([{ url: '', fileName: '' }]);
const checkinSaving = ref(false);
const checkinFileUploading = ref(false);
const checkinDropActive = ref(false);
/** 多文件上传时「1 / 3」进度文案 */
const checkinUploadProgress = ref('');
let checkinDraftSaveTimer: ReturnType<typeof setTimeout> | null = null;
/** 最近一次核验未通过时，服务端返回的模糊维度（422） */
const checkinReview = ref<CheckinPublicReview | null>(null);
const checkinAppealText = ref('');
const appealSubmitting = ref(false);
const appealWithdrawKey = ref<string | null>(null);
const okBanner = ref('');

function checkinBandLabel(band: CheckinPublicReview['dimensions'][number]['band']): string {
  if (band === 'high') return '良好';
  if (band === 'mid') return '一般';
  return '偏低';
}

type SlotCheckinState = '未提交' | '已提交' | '申诉中';

function slotCheckinStateLabel(slotKey: string): SlotCheckinState {
  if (plan.value?.scheduleSlotOpenAppeals?.[slotKey]) return '申诉中';
  if (slotSubmissions(slotKey).length > 0) return '已提交';
  return '未提交';
}

function slotCheckinStatePillClass(slotKey: string): string {
  const s = slotCheckinStateLabel(slotKey);
  if (s === '申诉中') {
    return 'bg-amber-50 text-amber-900 ring-1 ring-amber-200/80';
  }
  if (s === '已提交') {
    return 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/80';
  }
  return 'bg-slate-100 text-slate-600 ring-1 ring-slate-200/80';
}

function checkinDraftStorageKey(slotKey: string): string {
  return `planCheckinDraft:${planId.value}:${slotKey}`;
}

function tryLoadCheckinDraft(slotKey: string) {
  try {
    const raw = localStorage.getItem(checkinDraftStorageKey(slotKey));
    if (!raw) return;
    const d = JSON.parse(raw) as {
      content?: string;
      uploaded?: Array<{ url: string; fileName: string }>;
      manual?: Array<{ url: string; fileName: string }>;
    };
    if (typeof d.content === 'string') checkinContent.value = d.content;
    if (Array.isArray(d.uploaded) && d.uploaded.length > 0) {
      checkinUploadedFiles.value = d.uploaded.map((r) => ({
        url: String(r.url ?? ''),
        fileName: String(r.fileName ?? '附件'),
      })).filter((r) => r.url.length > 0);
    }
    if (Array.isArray(d.manual) && d.manual.length > 0) {
      checkinManualLinks.value = d.manual.map((r) => ({
        url: String(r.url ?? ''),
        fileName: String(r.fileName ?? ''),
      }));
    }
  } catch {
    /* 忽略坏数据 */
  }
}

function clearCheckinDraftForSlot(slotKey: string) {
  try {
    localStorage.removeItem(checkinDraftStorageKey(slotKey));
  } catch {
    /* ignore */
  }
}

function openCheckinSubmit(slotKey: string, planText: string) {
  checkinSlotKey.value = slotKey;
  checkinSlotPlanText.value = planText;
  checkinContent.value = '';
  checkinUploadedFiles.value = [];
  checkinManualLinks.value = [{ url: '', fileName: '' }];
  checkinReview.value = null;
  checkinAppealText.value = '';
  checkinOpen.value = true;
  tryLoadCheckinDraft(slotKey);
}

watch([checkinContent, checkinUploadedFiles, checkinManualLinks], () => {
  checkinReview.value = null;
}, { deep: true });

watch(
  [checkinOpen, checkinContent, checkinUploadedFiles, checkinManualLinks],
  () => {
    if (!checkinOpen.value) return;
    const sk = checkinSlotKey.value;
    if (!sk) return;
    if (checkinDraftSaveTimer) clearTimeout(checkinDraftSaveTimer);
    checkinDraftSaveTimer = setTimeout(() => {
      checkinDraftSaveTimer = null;
      try {
        localStorage.setItem(
          checkinDraftStorageKey(sk),
          JSON.stringify({
            content: checkinContent.value,
            uploaded: checkinUploadedFiles.value,
            manual: checkinManualLinks.value,
          }),
        );
      } catch {
        /* 可能超出配额 */
      }
    }, 500);
  },
  { deep: true },
);

function removeCheckinUploaded(idx: number) {
  checkinUploadedFiles.value.splice(idx, 1);
}

function removeCheckinManualRow(idx: number) {
  checkinManualLinks.value.splice(idx, 1);
  if (checkinManualLinks.value.length === 0) {
    checkinManualLinks.value.push({ url: '', fileName: '' });
  }
}

function mergedCheckinAttachments(): Array<{ url: string; fileName?: string }> {
  const manual = checkinManualLinks.value
    .map((a) => ({
      url: a.url.trim(),
      fileName: a.fileName.trim() || undefined,
    }))
    .filter((a) => a.url.length > 0);
  return [...checkinUploadedFiles.value, ...manual];
}

function onCheckinDrop(e: DragEvent) {
  checkinDropActive.value = false;
  const files = e.dataTransfer?.files;
  if (files?.length) void onCheckinFilesPicked(files);
}

function addCheckinManualLinkRow() {
  checkinManualLinks.value.push({ url: '', fileName: '' });
}

async function onCheckinFilesPicked(files: FileList | null) {
  if (!files?.length || !authState.token) return;
  const arr = Array.from(files);
  checkinFileUploading.value = true;
  checkinUploadProgress.value = '';
  try {
    const total = arr.length;
    for (let i = 0; i < total; i++) {
      if (total > 1) checkinUploadProgress.value = `${i + 1} / ${total}`;
      const f = arr[i]!;
      const res = await getApiClient().uploadUserFile({ token: authState.token, file: f });
      checkinUploadedFiles.value.push({ url: res.url, fileName: res.fileName || f.name });
    }
  } catch (e) {
    showError(e instanceof Error ? e.message : '文件上传失败');
  } finally {
    checkinUploadProgress.value = '';
    checkinFileUploading.value = false;
  }
}

async function submitCheckin() {
  if (!authState.token || !checkinSlotKey.value) return;
  const atts = mergedCheckinAttachments();
  const text = checkinContent.value.trim();
  if (!text && atts.length === 0) {
    showError('请填写说明、上传文件或添加至少一条有效链接');
    return;
  }
  checkinSaving.value = true;
  try {
    const { submission } = await getApiClient().postPlanScheduleSlotCheckin({
      id: planId.value,
      slotKey: checkinSlotKey.value,
      token: authState.token,
      content: text || undefined,
      attachments: atts.length ? atts : undefined,
    });
    const slot = checkinSlotKey.value;
    trackEvent('checkin_submit', {
      properties: {
        planId: planId.value,
        slotKey: slot,
      },
    });
    clearCheckinDraftForSlot(slot);
    const cur = { ...(plan.value?.scheduleSlotSubmissions ?? {}) };
    cur[slot] = [submission, ...(cur[slot] ?? [])];
    if (plan.value) plan.value = { ...plan.value, scheduleSlotSubmissions: cur };
    checkinOpen.value = false;
    checkinReview.value = null;
  } catch (e) {
    if (e instanceof HttpApiError && e.status === 422) {
      const body = e.body as { review?: CheckinPublicReview } | null | undefined;
      if (body && body.review && Array.isArray(body.review.dimensions)) {
        checkinReview.value = body.review;
        showError(body.review.summary || e.message);
        return;
      }
    }
    checkinReview.value = null;
    showError(e instanceof Error ? e.message : '提交失败');
  } finally {
    checkinSaving.value = false;
  }
}

async function submitCheckinAppeal() {
  if (!authState.token || !checkinSlotKey.value) return;
  const t = checkinAppealText.value.trim();
  if (t.length < 4) {
    showError('请至少填写 4 个字的申诉说明');
    return;
  }
  appealSubmitting.value = true;
  try {
    await getApiClient().postPlanScheduleSlotAppeal({
      id: planId.value,
      slotKey: checkinSlotKey.value,
      token: authState.token,
      content: t,
    });
    checkinOpen.value = false;
    checkinReview.value = null;
    checkinAppealText.value = '';
    okBanner.value =
      '申诉已提交。该时间槽在工作人员处理前会显示「申诉中」；你也可在列表中撤销申诉，再补充材料后重试。';
    window.setTimeout(() => {
      okBanner.value = '';
    }, 5000);
    await loadPlanDetail();
  } catch (e) {
    showError(e instanceof Error ? e.message : '提交申诉失败');
  } finally {
    appealSubmitting.value = false;
  }
}

async function withdrawSlotAppeal(slotKey: string) {
  if (!authState.token) return;
  appealWithdrawKey.value = slotKey;
  try {
    await getApiClient().deletePlanScheduleSlotAppeal({
      id: planId.value,
      slotKey,
      token: authState.token,
    });
    await loadPlanDetail();
    okBanner.value = '已撤销申诉。可以重新打开「提交证明」补充内容后再次尝试，或再次发起申诉。';
    window.setTimeout(() => {
      okBanner.value = '';
    }, 6000);
  } catch (e) {
    showError(e instanceof Error ? e.message : '撤销申诉失败');
  } finally {
    appealWithdrawKey.value = null;
  }
}

function showError(message: string) {
  errorToastMessage.value = message;
}

function clearError() {
  errorToastMessage.value = '';
}

useCloseOnEscape(scheduleEditOpen, () => {
  scheduleEditOpen.value = false;
});
useCloseOnEscape(checkinOpen, () => {
  checkinOpen.value = false;
});
useCloseOnEscape(showPublishForm, () => {
  showPublishForm.value = false;
});

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

async function submitArchivePlan() {
  if (!authState.token || !plan.value) return;
  archiveSubmitting.value = true;
  try {
    await getApiClient().archivePlan({
      id: plan.value.id,
      token: authState.token,
    });
    confirmArchiveOpen.value = false;
    await loadPlanDetail();
    okBanner.value = '已移入归档。可在侧栏「归档」中查看或恢复。';
    window.setTimeout(() => {
      okBanner.value = '';
    }, 4000);
  } catch (e) {
    showError(e instanceof Error ? e.message : '归档失败');
  } finally {
    archiveSubmitting.value = false;
  }
}

async function submitUnarchivePlan() {
  if (!authState.token || !plan.value) return;
  archiveSubmitting.value = true;
  try {
    await getApiClient().unarchivePlan({
      id: plan.value.id,
      token: authState.token,
    });
    await loadPlanDetail();
    okBanner.value = '已移回「我的计划」，可继续执行与打卡。';
    window.setTimeout(() => {
      okBanner.value = '';
    }, 4000);
  } catch (e) {
    showError(e instanceof Error ? e.message : '恢复执行失败');
  } finally {
    archiveSubmitting.value = false;
  }
}

const lastOpenedCheckinQueryKey = ref('');

onMounted(loadPlanDetail);
watch(
  () => route.params.id,
  () => {
    lastOpenedCheckinQueryKey.value = '';
    void loadPlanDetail();
  }
);

/** 自通知中心跳转 ?openCheckin=1&slotKey= 时打开提交证明 */
watch(
  [() => route.query.openCheckin, () => route.query.slotKey, canSubmitCheckin, checkinSchedule],
  () => {
    if (route.query.openCheckin !== '1') return;
    const sk = route.query.slotKey;
    if (typeof sk !== 'string' || !checkinSchedule.value) return;
    if (!canSubmitCheckin.value) return;
    const key = `${planId.value}|${sk}`;
    if (key === lastOpenedCheckinQueryKey.value) return;
    const slot = checkinSchedule.value.slots.find((s) => s.slotKey === sk);
    if (!slot) return;
    lastOpenedCheckinQueryKey.value = key;
    openCheckinSubmit(sk, slot.content);
  },
  { immediate: true },
);
</script>

<template>
  <div
    class="plan-detail-root flex h-full min-h-0 w-full flex-col overflow-y-auto bg-[#eef2ef] font-display text-[#111813]"
  >
    <UiErrorToast :message="errorToastMessage" @close="clearError" />
    <div
      v-if="okBanner"
      class="pointer-events-none fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 shadow-lg ring-1 ring-emerald-200/90"
      role="status"
    >
      {{ okBanner }}
    </div>

    <div class="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-6">
        <nav
          class="mb-6 flex flex-wrap items-center gap-2 text-sm sm:text-base"
          aria-label="面包屑"
        >
          <router-link
            to="/plans"
            class="font-medium text-[#4d7a63] transition hover:text-[#0a8f4a]"
            >我的计划</router-link
          >
          <span class="font-medium text-[#b8d0c4]" aria-hidden="true">/</span>
          <span
            class="min-w-0 max-w-full truncate font-semibold text-[#203029]"
            data-testid="plan-detail-breadcrumb-current"
            :title="breadcrumbTailTitle || undefined"
            >{{ breadcrumbTail }}</span
          >
        </nav>

        <section
          class="plan-detail-hero mb-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_14px_44px_-28px_rgba(12,72,48,0.18)] ring-1 ring-slate-100 sm:p-6"
          data-testid="plan-detail-hero"
        >
          <h1 class="text-2xl font-black tracking-[-0.03em] text-[#0f1f16] sm:text-3xl">
            {{ plan ? plan.goal : loading ? '加载中…' : '计划详情' }}
          </h1>
          <div
            v-if="plan"
            class="mt-3 flex flex-wrap items-center gap-2 text-sm"
          >
            <span
              class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ring-1"
              :class="
                plan.status === 'draft'
                  ? 'bg-amber-50 text-amber-950 ring-amber-200/90'
                  : isArchived
                    ? 'bg-slate-100 text-slate-800 ring-slate-200/90'
                    : 'bg-emerald-50 text-emerald-900 ring-emerald-200/80'
              "
            >
              {{ statusLabel }}
            </span>
            <span
              v-if="typeLabel"
              class="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200/80"
            >
              {{ typeLabel }}
            </span>
            <span
              v-if="plan.deadline"
              class="text-[13px] font-medium text-[#5a6f62]"
            >
              截止 {{ formatDetailDeadline(plan.deadline) }}
            </span>
            <span
              v-if="plan.status === 'active' && !isArchived && isPastPlanDeadline"
              class="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] font-bold text-orange-900 ring-1 ring-orange-200/90"
              data-testid="plan-detail-deadline-past-hint"
            >
              已超过截止日，仍可补记打卡
            </span>
            <p
              v-if="plan.status === 'active' && !isArchived && checkinSchedule"
              class="mt-2 w-full text-[13px] leading-relaxed text-[#5a6f62]"
              data-testid="plan-detail-phase-hint"
            >
              当前在「执行」阶段：在下方打卡表中按各时间槽提交说明与证明；已逾期的计划截止日也仍可补记，状态与表中一致。
            </p>
            <p
              v-if="isArchived"
              class="mt-2 w-full text-[13px] font-medium leading-relaxed text-slate-600"
              data-testid="plan-detail-archived-hint"
            >
              本计划已归档：仅可查看，不能编辑打卡表或提交新证明。需要继续时请点下方「移回我的计划」。
            </p>
          </div>
          <div
            v-if="plan && plan.requirement && (plan.status === 'active' || isArchived)"
            class="plan-detail-md mt-5 border-t border-slate-100 pt-5"
            v-html="renderRequirementMd(plan.requirement)"
          />
          <div
            v-if="plan && !isDraft && authState.token"
            class="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4"
          >
            <button
              v-if="plan.status === 'active' && !isArchived"
              type="button"
              class="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              data-testid="btn-archive-plan"
              @click="confirmArchiveOpen = true"
            >
              归档
            </button>
            <button
              v-if="isArchived"
              type="button"
              class="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
              data-testid="btn-unarchive-plan"
              :disabled="archiveSubmitting"
              @click="submitUnarchivePlan"
            >
              {{ archiveSubmitting ? '处理中…' : '移回我的计划' }}
            </button>
          </div>
          <div v-if="canPublishTemplate" class="mt-4 border-t border-slate-100 pt-4">
            <button
              type="button"
              class="rounded-lg border border-[#dbe6df] bg-[#f6f8f6] px-4 py-2 text-sm font-semibold text-[#111813] hover:bg-[#eef3ef]"
              data-testid="btn-publish-template"
              @click="openPublishForm"
            >
              发布为模板
            </button>
          </div>

          <PlanPomodoroBar
            v-if="plan && plan.status === 'active' && !isArchived"
            :key="plan.id"
            :title="plan.goal"
          />
        </section>

        <section
          v-if="checkinSchedule"
          class="mb-6 rounded-2xl border border-[#d4e5dc] bg-white p-5 shadow-[0_12px_36px_-24px_rgba(12,72,48,0.14)] ring-1 ring-[#e8f2ec]"
          data-testid="plan-schedule-panel"
        >
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-[#2a3832]">打卡计划</p>
              <p class="mt-1 text-xs text-[#61896f]">
                颗粒度：{{ checkinSchedule.granularity === 'day' ? '按天' : '按周' }} ·
                <template v-if="!isArchived">可编辑计划文案；已定稿后在本表按槽提交完成证明（链接附件）。</template>
                <template v-else>已归档，打卡表为只读。</template>
                <template v-if="isPastPlanDeadline && plan?.status === 'active' && !isArchived">
                  已超过计划截止日，仍可补记与编辑。
                </template>
              </p>
            </div>
            <p class="text-xs text-[#61896f]">共 {{ checkinSchedule.slots.length }} 个时间槽</p>
          </div>

          <div class="mt-4 hidden overflow-x-auto md:block">
            <table class="w-full min-w-[640px] text-left text-sm">
              <thead class="border-b border-slate-200 bg-[#f6faf7] text-xs font-semibold text-[#4a6358]">
                <tr>
                  <th class="whitespace-nowrap px-3 py-3 font-semibold">时间槽</th>
                  <th class="px-3 py-3 font-semibold">计划内容</th>
                  <th class="whitespace-nowrap px-3 py-3 font-semibold">状态</th>
                  <th class="whitespace-nowrap px-3 py-3 font-semibold">提交记录</th>
                  <th class="whitespace-nowrap px-3 py-3 text-right font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="slot in checkinSchedule.slots"
                  :key="`tbl-${slot.slotKey}`"
                  class="border-b border-slate-100 align-top"
                >
                  <td class="whitespace-nowrap px-3 py-3">
                    <span class="font-mono text-xs font-semibold text-[#2a3832]">{{ slot.slotKey }}</span>
                    <span
                      v-if="slot.contentSource === 'edited'"
                      class="ml-1 inline-flex rounded-full bg-[#f1f5f3] px-2 py-0.5 text-[10px] font-bold text-[#2a3832]"
                    >
                      已编辑
                    </span>
                  </td>
                  <td class="max-w-[min(28rem,40vw)] px-3 py-3">
                    <p class="line-clamp-4 whitespace-pre-wrap text-[13px] leading-relaxed text-[#111813]">
                      {{ slot.content }}
                    </p>
                  </td>
                  <td class="whitespace-nowrap px-3 py-3">
                    <span
                      :class="slotCheckinStatePillClass(slot.slotKey)"
                      class="inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                      :data-testid="`schedule-slot-status-${slot.slotKey}`"
                    >
                      {{ slotCheckinStateLabel(slot.slotKey) }}
                    </span>
                  </td>
                  <td class="whitespace-nowrap px-3 py-3 text-xs text-[#2a3832]">
                    {{ slotSubmissionSummary(slot.slotKey) }}
                  </td>
                  <td class="px-3 py-3 text-right">
                    <div class="flex flex-wrap justify-end gap-1.5">
                      <button
                        v-if="canSubmitCheckin"
                        type="button"
                        class="rounded-lg border border-[#0a8f4a]/35 bg-emerald-50/90 px-2.5 py-1 text-xs font-bold text-[#0b5c34] hover:bg-emerald-100 disabled:opacity-50"
                        :disabled="scheduleSaving || checkinSaving"
                        data-testid="schedule-slot-checkin"
                        @click="openCheckinSubmit(slot.slotKey, slot.content)"
                      >
                        提交证明
                      </button>
                      <button
                        v-if="!isArchived"
                        type="button"
                        class="rounded-lg border border-[#dbe6df] bg-white px-2.5 py-1 text-xs font-semibold text-[#111813] hover:bg-[#f6f8f6] disabled:opacity-50"
                        :disabled="scheduleSaving"
                        data-testid="schedule-slot-edit"
                        @click="openScheduleEdit(slot.slotKey, slot.content)"
                      >
                        编辑
                      </button>
                      <button
                        v-if="!isArchived"
                        type="button"
                        class="rounded-lg border border-[#f0d8d6] bg-white px-2.5 py-1 text-xs font-semibold text-[#7b2f28] hover:bg-[#fff7f6] disabled:opacity-50"
                        :disabled="scheduleSaving"
                        data-testid="schedule-slot-restore"
                        @click="restoreScheduleSlot(slot.slotKey)"
                      >
                        恢复
                      </button>
                      <button
                        v-if="!isArchived && slotCheckinStateLabel(slot.slotKey) === '申诉中'"
                        type="button"
                        class="rounded-lg border border-amber-200/90 bg-amber-50/90 px-2.5 py-1 text-xs font-bold text-amber-950 hover:bg-amber-100/90 disabled:opacity-50"
                        :disabled="!!appealWithdrawKey"
                        data-testid="schedule-slot-appeal-withdraw"
                        @click="withdrawSlotAppeal(slot.slotKey)"
                      >
                        {{
                          appealWithdrawKey === slot.slotKey ? '撤销中…' : '撤销申诉'
                        }}
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mt-4 grid gap-3 md:hidden">
            <article
              v-for="slot in checkinSchedule.slots"
              :key="`mob-${slot.slotKey}`"
              class="rounded-xl border border-slate-100 bg-[#fbfcfb] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
            >
              <div class="flex flex-col gap-3">
                <div class="min-w-0">
                  <p class="text-xs font-semibold tracking-[0.06em] text-[#61896f]">
                    {{ slot.slotKey }}
                    <span
                      v-if="slot.contentSource === 'edited'"
                      class="ml-2 inline-flex rounded-full bg-[#f1f5f3] px-2 py-0.5 text-[10px] font-bold text-[#2a3832]"
                    >
                      已编辑
                    </span>
                  </p>
                  <p class="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#111813]">{{ slot.content }}</p>
                  <p class="mt-1 text-xs text-[#61896f]">
                    状态：
                    <span
                      :class="slotCheckinStatePillClass(slot.slotKey)"
                      class="ml-0.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold"
                    >
                      {{ slotCheckinStateLabel(slot.slotKey) }}
                    </span>
                  </p>
                  <p class="mt-1 text-xs text-[#61896f]">提交：{{ slotSubmissionSummary(slot.slotKey) }}</p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-if="canSubmitCheckin"
                    type="button"
                    class="rounded-lg border border-[#0a8f4a]/35 bg-emerald-50/90 px-3 py-1.5 text-xs font-bold text-[#0b5c34] hover:bg-emerald-100 disabled:opacity-50"
                    :disabled="scheduleSaving || checkinSaving"
                    data-testid="schedule-slot-checkin-mobile"
                    @click="openCheckinSubmit(slot.slotKey, slot.content)"
                  >
                    提交证明
                  </button>
                  <button
                    v-if="!isArchived"
                    type="button"
                    class="rounded-lg border border-[#dbe6df] bg-white px-3 py-1.5 text-xs font-semibold text-[#111813] hover:bg-[#f6f8f6] disabled:opacity-50"
                    :disabled="scheduleSaving"
                    data-testid="schedule-slot-edit-mobile"
                    @click="openScheduleEdit(slot.slotKey, slot.content)"
                  >
                    编辑
                  </button>
                  <button
                    v-if="!isArchived"
                    type="button"
                    class="rounded-lg border border-[#f0d8d6] bg-white px-3 py-1.5 text-xs font-semibold text-[#7b2f28] hover:bg-[#fff7f6] disabled:opacity-50"
                    :disabled="scheduleSaving"
                    data-testid="schedule-slot-restore-mobile"
                    @click="restoreScheduleSlot(slot.slotKey)"
                  >
                    恢复
                  </button>
                  <button
                    v-if="!isArchived && slotCheckinStateLabel(slot.slotKey) === '申诉中'"
                    type="button"
                    class="rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-100/90 disabled:opacity-50"
                    :disabled="!!appealWithdrawKey"
                    data-testid="schedule-slot-appeal-withdraw-mobile"
                    @click="withdrawSlotAppeal(slot.slotKey)"
                  >
                    {{
                      appealWithdrawKey === slot.slotKey ? '撤销中…' : '撤销申诉'
                    }}
                  </button>
                </div>
              </div>
            </article>
          </div>
        </section>

        <div
          v-if="scheduleEditOpen"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          data-testid="schedule-edit-dialog"
          role="dialog"
          aria-modal="true"
          @click.self="scheduleEditOpen = false"
        >
          <div class="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl" @click.stop>
            <div class="flex items-start justify-between gap-4">
              <div>
                <h3 class="text-base font-bold">编辑打卡内容</h3>
                <p class="mt-1 text-xs text-[#61896f]">时间槽：{{ scheduleEditSlotKey }}</p>
              </div>
              <button
                type="button"
                class="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#61896f] hover:bg-white/60"
                @click="scheduleEditOpen = false"
              >
                关闭
              </button>
            </div>
            <textarea
              v-model="scheduleEditContent"
              rows="6"
              class="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm leading-relaxed"
              placeholder="仅编辑内容文本，不改变 slotKey"
            />
            <div class="mt-5 flex justify-end gap-2">
              <button
                type="button"
                class="rounded-lg px-4 py-2 text-sm font-semibold text-[#61896f]"
                :disabled="scheduleSaving"
                @click="scheduleEditOpen = false"
              >
                取消
              </button>
              <button
                type="button"
                class="rounded-lg bg-[#111813] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                :disabled="scheduleSaving"
                data-testid="schedule-edit-save"
                @click="saveScheduleEdit"
              >
                {{ scheduleSaving ? '保存中…' : '保存' }}
              </button>
            </div>
          </div>
        </div>

        <div
          v-if="checkinOpen"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4"
          data-testid="schedule-checkin-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="schedule-checkin-title"
          @click.self="checkinOpen = false"
        >
          <div
            class="flex max-h-[min(88vh,700px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200/80"
            @click.stop
          >
            <header class="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4">
              <div class="min-w-0">
                <h3 id="schedule-checkin-title" class="text-base font-bold tracking-tight text-[#0f1f16]">
                  提交完成证明
                </h3>
                <p class="mt-1 font-mono text-[11px] font-semibold text-[#61896f]">时间槽 {{ checkinSlotKey }}</p>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium text-[#61896f] hover:bg-slate-100"
                aria-label="关闭"
                @click="checkinOpen = false"
              >
                关闭
              </button>
            </header>

            <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <p
                class="mb-4 rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 py-2.5 text-xs leading-relaxed text-[#4a5c52]"
                data-testid="schedule-checkin-privacy-note"
              >
                说明、链接与上传文件会随本期打卡一起保存。核验会综合参考文字与材料；除你本人外，材料仅经后端处理，不会公开展示于其他用户端。
              </p>
              <section
                v-if="checkinSlotPlanText.trim()"
                class="rounded-xl border border-slate-200/90 bg-[#f8faf9] p-3 sm:p-3.5"
              >
                <p class="text-[11px] font-bold uppercase tracking-[0.12em] text-[#61896f]">本期计划（对照）</p>
                <p
                  class="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-[#1a2e24]"
                >
                  {{ checkinSlotPlanText }}
                </p>
              </section>

              <section class="mt-4" :class="{ 'mt-3': checkinSlotPlanText.trim() }">
                <div class="flex items-baseline justify-between gap-2">
                  <div>
                    <p class="text-sm font-bold text-[#142820]">上传附件</p>
                    <p class="mt-0.5 text-xs text-[#61896f]">推荐：图片、PDF、Word、文本等，可多选</p>
                  </div>
                </div>
                <label
                  class="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition sm:py-9"
                  :class="
                    checkinDropActive
                      ? 'border-[#0a8f4a] bg-emerald-50/70 ring-2 ring-[#0a8f4a]/25'
                      : 'border-[#c5d9ce] bg-[#fbfcfb] hover:border-[#8fbc9f] hover:bg-[#f4f9f6]'
                  "
                  @dragenter.prevent="checkinDropActive = true"
                  @dragover.prevent="checkinDropActive = true"
                  @dragleave.prevent="checkinDropActive = false"
                  @drop.prevent="onCheckinDrop"
                >
                  <span class="text-sm font-semibold text-[#1a3d2e]">
                    {{
                      checkinFileUploading
                        ? checkinUploadProgress
                          ? `正在上传 ${checkinUploadProgress}…`
                          : '正在上传…'
                        : '将文件拖到这里，或点击选择'
                    }}
                  </span>
                  <span class="mt-1.5 text-xs text-[#61896f]">支持多文件；单文件不超过 15MB</span>
                  <input
                    type="file"
                    class="sr-only"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.txt,.md,.csv"
                    data-testid="schedule-checkin-upload-input"
                    :disabled="checkinFileUploading"
                    @change="
                      void onCheckinFilesPicked(($event.target as HTMLInputElement).files);
                      (($event.target as HTMLInputElement).value = '')
                    "
                  />
                </label>
                <ul
                  v-if="checkinUploadedFiles.length > 0"
                  class="mt-3 flex flex-wrap gap-2"
                  aria-label="已上传的附件"
                >
                  <li
                    v-for="(row, idx) in checkinUploadedFiles"
                    :key="`up-${idx}-${row.url}`"
                    class="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-white py-1 pl-2.5 pr-1 text-xs font-medium text-[#2a3832] shadow-sm"
                  >
                    <span class="max-w-[200px] truncate" :title="row.fileName || row.url">{{
                      row.fileName || '附件'
                    }}</span>
                    <button
                      type="button"
                      class="rounded-full p-0.5 text-[#61896f] hover:bg-slate-100 hover:text-[#7b2f28]"
                      :aria-label="`移除 ${row.fileName || '附件'}`"
                      @click="removeCheckinUploaded(idx)"
                    >
                      ×
                    </button>
                  </li>
                </ul>
              </section>

              <section class="mt-5">
                <label for="schedule-checkin-note" class="text-sm font-bold text-[#142820]">完成说明</label>
                <textarea
                  id="schedule-checkin-note"
                  v-model="checkinContent"
                  rows="4"
                  class="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-relaxed text-[#111813] placeholder:text-slate-400 focus:border-[#4d7a63] focus:outline-none focus:ring-1 focus:ring-[#4d7a63]/40"
                  placeholder="简要说明本期完成情况；无文字时请至少上传一个文件或添加下方链接。"
                />
              </section>

              <details class="checkin-link-details mt-4 rounded-xl border border-slate-200/90 bg-[#fbfcfb]">
                <summary
                  class="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-[#2a3832] marker:content-none [&::-webkit-details-marker]:hidden"
                >
                  <span class="inline-flex items-center gap-2">
                    <span class="checkin-details-chevron text-[#61896f]">▸</span>
                    已有网盘 / 图床链接？手动添加
                  </span>
                </summary>
                <div class="border-t border-slate-100 px-3 pb-3 pt-1">
                  <p class="mb-2 text-xs text-[#61896f]">填写可访问的 https 链接；显示名称仅作展示。</p>
                  <div class="space-y-2">
                    <div
                      v-for="(row, idx) in checkinManualLinks"
                      :key="`link-${idx}`"
                      class="flex flex-col gap-2 sm:flex-row sm:items-center"
                    >
                      <input
                        v-model="row.url"
                        type="url"
                        class="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        placeholder="https://…"
                        inputmode="url"
                      />
                      <div class="flex shrink-0 items-center gap-2 sm:w-auto">
                        <input
                          v-model="row.fileName"
                          type="text"
                          class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm sm:w-36"
                          placeholder="显示名（可选）"
                        />
                        <button
                          v-if="checkinManualLinks.length > 1"
                          type="button"
                          class="rounded-lg px-2 py-1.5 text-xs font-semibold text-[#61896f] hover:bg-slate-100"
                          @click="removeCheckinManualRow(idx)"
                        >
                          删行
                        </button>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="mt-2 text-xs font-bold text-[#0f8b4e] hover:underline"
                    @click="addCheckinManualLinkRow"
                  >
                    + 再加一行链接
                  </button>
                </div>
              </details>

              <section
                v-if="checkinReview && !checkinReview.passed"
                class="mt-4 rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-3 sm:px-4"
                data-testid="schedule-checkin-review-panel"
              >
                <p class="text-sm font-bold text-amber-950">未通过核验</p>
                <p class="mt-1 text-xs leading-relaxed text-amber-900/90">
                  本次不会保存。请按下方维度补充说明或附件后再点「提交」。
                </p>
                <ul class="mt-2 space-y-2">
                  <li
                    v-for="dim in checkinReview.dimensions"
                    :key="dim.id"
                    class="rounded-lg bg-white/80 px-2.5 py-2 text-xs leading-relaxed text-[#1a2e24] ring-1 ring-amber-100/80"
                  >
                    <span class="font-bold text-[#142820]">{{ dim.label }}</span>
                    <span class="mx-1.5 text-[#61896f]">·</span>
                    <span class="font-semibold text-amber-900/90">{{ checkinBandLabel(dim.band) }}</span>
                    <p class="mt-1 text-[#2a3832]/90">{{ dim.hint }}</p>
                  </li>
                </ul>
              </section>

              <section
                v-if="checkinReview && !checkinReview.passed"
                class="mt-3 rounded-xl border border-rose-200/90 bg-rose-50/80 px-3 py-3 sm:px-4"
                data-testid="schedule-checkin-appeal-panel"
              >
                <p class="text-sm font-bold text-rose-900">对核验结果有异议？可提交申诉</p>
                <p class="mt-1 text-xs text-rose-800/90">
                  说明情况与理由（至少 4 字）。提交后该时间槽为「申诉中」直至处理；你可随时在打卡表中「撤销申诉」后重新补充材料，再点「提交证明」。
                </p>
                <textarea
                  v-model="checkinAppealText"
                  rows="3"
                  class="mt-2 w-full rounded-xl border border-rose-200/80 bg-white px-3 py-2 text-sm text-[#111813] placeholder:text-rose-300 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-300/50"
                  placeholder="例：已上传的截图在附件中，申请人工复核…"
                />
                <div class="mt-2 flex justify-end">
                  <button
                    type="button"
                    class="rounded-lg border border-rose-300/80 bg-white px-4 py-2 text-sm font-bold text-rose-900 shadow-sm hover:bg-rose-50 disabled:opacity-50"
                    :disabled="appealSubmitting"
                    data-testid="schedule-checkin-appeal-submit"
                    @click="submitCheckinAppeal"
                  >
                    {{ appealSubmitting ? '提交中…' : '提交申诉' }}
                  </button>
                </div>
              </section>
            </div>

            <footer
              class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:px-5"
            >
              <button
                type="button"
                class="rounded-lg px-4 py-2 text-sm font-semibold text-[#61896f] hover:bg-slate-50"
                :disabled="checkinSaving || appealSubmitting"
                @click="checkinOpen = false"
              >
                取消
              </button>
              <button
                type="button"
                class="rounded-lg bg-[#111813] px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#0d1410] disabled:opacity-50"
                :disabled="checkinSaving || checkinFileUploading || appealSubmitting"
                data-testid="schedule-checkin-submit"
                @click="submitCheckin"
              >
                {{ checkinSaving ? '提交中…' : '提交' }}
              </button>
            </footer>
          </div>
        </div>

        <div
          v-if="showPublishForm"
          class="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          data-testid="publish-template-dialog"
          @click.self="showPublishForm = false"
        >
          <div class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" @click.stop>
            <h3 class="text-lg font-bold">发布到模板市场</h3>
            <p class="mt-1 text-xs text-[#61896f]">将基于当前计划生成可被套用的市场模板（标题与摘要可编辑）。</p>
            <label class="mt-4 block text-sm font-medium">标题</label>
            <input
              v-model="publishForm.title"
              type="text"
              class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              maxlength="200"
            />
            <label class="mt-3 block text-sm font-medium">摘要</label>
            <textarea
              v-model="publishForm.summary"
              rows="4"
              class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              maxlength="5000"
            />
            <label class="mt-3 block text-sm font-medium">分类</label>
            <input
              v-model="publishForm.category"
              type="text"
              class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="如 study / work / fitness"
            />
            <label class="mt-3 block text-sm font-medium">标签（逗号分隔）</label>
            <input
              v-model="publishForm.tags"
              type="text"
              class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="学习, 考试"
            />
            <div class="mt-6 flex justify-end gap-2">
              <button
                type="button"
                class="rounded-lg px-4 py-2 text-sm font-medium text-[#61896f]"
                @click="showPublishForm = false"
              >
                取消
              </button>
              <button
                type="button"
                class="rounded-lg bg-[#111813] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                :disabled="publishSubmitting"
                data-testid="confirm-publish-template"
                @click="submitPublishTemplate"
              >
                {{ publishSubmitting ? '发布中…' : '确认发布' }}
              </button>
            </div>
          </div>
        </div>

        <section
          v-if="isDraft"
          class="mb-6 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950"
          data-testid="plan-detail-draft-banner"
        >
          <p class="font-bold">该计划仍处于草稿阶段</p>
          <p class="mt-1 text-amber-900/90">请前往草稿页对比版本并确认后，再在打卡计划中提交执行记录。</p>
          <router-link
            :to="`/plans/${planId}/draft`"
            class="mt-3 inline-flex h-9 items-center rounded-lg bg-amber-600 px-4 text-sm font-bold text-white hover:bg-amber-700"
          >
            前往草稿确认
          </router-link>
  </section>

    <UiConfirmDialog
      v-model="confirmArchiveOpen"
      title="将计划移入归档？"
      description="归档后将从「我的计划」列表中隐藏，且不能继续打卡或编辑排期；可随时在「归档」页或本页恢复执行。"
      confirm-text="确认归档"
      cancel-text="取消"
      :loading="archiveSubmitting"
      :close-on-confirm="false"
      data-testid="confirm-archive-dialog"
      @confirm="submitArchivePlan"
      @cancel="confirmArchiveOpen = false"
    />
    </div>
  </div>
</template>

<style scoped>
.plan-detail-md :deep(h1),
.plan-detail-md :deep(h2),
.plan-detail-md :deep(h3) {
  margin: 1rem 0 0.5rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.3;
  color: #142820;
}
.plan-detail-md :deep(h1) {
  font-size: 1.125rem;
}
.plan-detail-md :deep(h2) {
  font-size: 1.02rem;
  color: #1a3d2e;
}
.plan-detail-md :deep(h3) {
  font-size: 0.95rem;
  color: #234236;
}
.plan-detail-md :deep(h1:first-child),
.plan-detail-md :deep(h2:first-child),
.plan-detail-md :deep(h3:first-child) {
  margin-top: 0;
}
.plan-detail-md :deep(p) {
  margin: 0.5rem 0;
  font-size: 0.875rem;
  line-height: 1.65;
  color: #2a3832;
}
.plan-detail-md :deep(ul),
.plan-detail-md :deep(ol) {
  margin: 0.45rem 0 0.65rem;
  padding-left: 1.25rem;
}
.plan-detail-md :deep(li) {
  margin: 0.25rem 0;
  font-size: 0.875rem;
  line-height: 1.55;
  color: #334a40;
}
.plan-detail-md :deep(strong) {
  color: #0d5c36;
  font-weight: 800;
}
.plan-detail-md :deep(code) {
  border-radius: 0.35rem;
  background: rgba(15, 139, 78, 0.08);
  padding: 0.1rem 0.35rem;
  font-size: 0.8em;
  font-weight: 600;
  color: #0b5c34;
}
.plan-detail-md :deep(pre) {
  margin: 0.65rem 0;
  overflow-x: auto;
  border-radius: 0.65rem;
  border: 1px solid rgba(27, 111, 73, 0.12);
  background: rgba(248, 252, 250, 0.98);
  padding: 0.75rem 0.85rem;
  font-size: 0.8rem;
  line-height: 1.5;
}
.plan-detail-md :deep(pre code) {
  padding: 0;
  background: none;
}
.plan-detail-md :deep(blockquote) {
  margin: 0.65rem 0;
  border-left: 3px solid rgba(15, 139, 78, 0.45);
  padding-left: 0.85rem;
  color: #4a6358;
  font-style: italic;
}
.plan-detail-md :deep(a) {
  color: #0f8b4e;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.plan-detail-md :deep(hr) {
  margin: 1rem 0;
  border: none;
  border-top: 1px solid rgba(27, 111, 73, 0.15);
}

.checkin-link-details[open] .checkin-details-chevron {
  transform: rotate(90deg);
}
.checkin-details-chevron {
  display: inline-block;
  transition: transform 0.15s ease;
}
</style>
