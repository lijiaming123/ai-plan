<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UiErrorToast from '../../components/UiErrorToast.vue';
import type { PlanRecord } from '../../lib/api-client';
import { getApiClient } from '../../lib/api-client';
import { renderMarkdownToHtml } from '../../lib/render-markdown';
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
    await getApiClient().publishMarketTemplate({
      token: authState.token,
      title: publishForm.value.title.trim(),
      summary: publishForm.value.summary.trim(),
      category: publishForm.value.category.trim() || 'general',
      tags,
      planId: plan.value.id,
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
  () => !!authState.token && !isDraft.value && plan.value?.status === 'active'
);

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
const checkinContent = ref('');
const checkinAttachments = ref<Array<{ url: string; fileName: string }>>([{ url: '', fileName: '' }]);
const checkinSaving = ref(false);

function openCheckinSubmit(slotKey: string) {
  checkinSlotKey.value = slotKey;
  checkinContent.value = '';
  checkinAttachments.value = [{ url: '', fileName: '' }];
  checkinOpen.value = true;
}

function addCheckinAttachmentRow() {
  checkinAttachments.value.push({ url: '', fileName: '' });
}

function onCheckinFilesPicked(files: FileList | null) {
  if (!files?.length) return;
  for (const f of Array.from(files)) {
    checkinAttachments.value.push({ url: `local://${f.name}`, fileName: f.name });
  }
}

async function submitCheckin() {
  if (!authState.token || !checkinSlotKey.value) return;
  const atts = checkinAttachments.value
    .map((a) => ({
      url: a.url.trim(),
      fileName: a.fileName.trim() || undefined,
    }))
    .filter((a) => a.url.length > 0);
  const text = checkinContent.value.trim();
  if (!text && atts.length === 0) {
    showError('请填写说明或至少添加一个附件链接');
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
    const cur = { ...(plan.value?.scheduleSlotSubmissions ?? {}) };
    cur[slot] = [submission, ...(cur[slot] ?? [])];
    if (plan.value) plan.value = { ...plan.value, scheduleSlotSubmissions: cur };
    checkinOpen.value = false;
  } catch (e) {
    showError(e instanceof Error ? e.message : '提交失败');
  } finally {
    checkinSaving.value = false;
  }
}

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
  <div
    class="plan-detail-root flex h-full min-h-0 w-full flex-col overflow-y-auto bg-[#eef2ef] font-display text-[#111813]"
  >
    <UiErrorToast :message="errorToastMessage" @close="clearError" />

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
                plan.status === 'active'
                  ? 'bg-emerald-50 text-emerald-900 ring-emerald-200/80'
                  : 'bg-amber-50 text-amber-950 ring-amber-200/90'
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
              v-if="plan.status === 'active' && isPastPlanDeadline"
              class="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] font-bold text-orange-900 ring-1 ring-orange-200/90"
              data-testid="plan-detail-deadline-past-hint"
            >
              已超过截止日，仍可补记打卡
            </span>
          </div>
          <div
            v-if="plan && plan.requirement && plan.status === 'active'"
            class="plan-detail-md mt-5 border-t border-slate-100 pt-5"
            v-html="renderRequirementMd(plan.requirement)"
          />
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
                颗粒度：{{ checkinSchedule.granularity === 'day' ? '按天' : '按周' }} · 可编辑计划文案；已定稿后在本表按槽提交完成证明（链接附件）。
                <template v-if="isPastPlanDeadline && plan?.status === 'active'">
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
                  <th class="whitespace-nowrap px-3 py-3 font-semibold">文案状态</th>
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
                  <td class="whitespace-nowrap px-3 py-3 text-xs text-[#61896f]">
                    {{ slot.contentSource === 'edited' ? '已改' : '生成' }}
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
                        @click="openCheckinSubmit(slot.slotKey)"
                      >
                        提交证明
                      </button>
                      <button
                        type="button"
                        class="rounded-lg border border-[#dbe6df] bg-white px-2.5 py-1 text-xs font-semibold text-[#111813] hover:bg-[#f6f8f6] disabled:opacity-50"
                        :disabled="scheduleSaving"
                        data-testid="schedule-slot-edit"
                        @click="openScheduleEdit(slot.slotKey, slot.content)"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        class="rounded-lg border border-[#f0d8d6] bg-white px-2.5 py-1 text-xs font-semibold text-[#7b2f28] hover:bg-[#fff7f6] disabled:opacity-50"
                        :disabled="scheduleSaving"
                        data-testid="schedule-slot-restore"
                        @click="restoreScheduleSlot(slot.slotKey)"
                      >
                        恢复
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
                  <p class="mt-2 text-xs text-[#61896f]">提交：{{ slotSubmissionSummary(slot.slotKey) }}</p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-if="canSubmitCheckin"
                    type="button"
                    class="rounded-lg border border-[#0a8f4a]/35 bg-emerald-50/90 px-3 py-1.5 text-xs font-bold text-[#0b5c34] hover:bg-emerald-100 disabled:opacity-50"
                    :disabled="scheduleSaving || checkinSaving"
                    data-testid="schedule-slot-checkin-mobile"
                    @click="openCheckinSubmit(slot.slotKey)"
                  >
                    提交证明
                  </button>
                  <button
                    type="button"
                    class="rounded-lg border border-[#dbe6df] bg-white px-3 py-1.5 text-xs font-semibold text-[#111813] hover:bg-[#f6f8f6] disabled:opacity-50"
                    :disabled="scheduleSaving"
                    data-testid="schedule-slot-edit-mobile"
                    @click="openScheduleEdit(slot.slotKey, slot.content)"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    class="rounded-lg border border-[#f0d8d6] bg-white px-3 py-1.5 text-xs font-semibold text-[#7b2f28] hover:bg-[#fff7f6] disabled:opacity-50"
                    :disabled="scheduleSaving"
                    data-testid="schedule-slot-restore-mobile"
                    @click="restoreScheduleSlot(slot.slotKey)"
                  >
                    恢复
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
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          data-testid="schedule-checkin-dialog"
          @click.self="checkinOpen = false"
        >
          <div class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" @click.stop>
            <div class="flex items-start justify-between gap-4">
              <div>
                <h3 class="text-base font-bold">提交完成证明</h3>
                <p class="mt-1 text-xs text-[#61896f]">时间槽：{{ checkinSlotKey }}</p>
                <p class="mt-1 text-xs text-[#61896f]">
                  请填写说明，并添加可访问的附件链接（图片、PDF、文档等）。与任务页一致，本地演示可使用「选择文件」生成占位链接。
                </p>
              </div>
              <button
                type="button"
                class="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#61896f] hover:bg-white/60"
                @click="checkinOpen = false"
              >
                关闭
              </button>
            </div>
            <label class="mt-4 block text-sm font-medium text-[#2a3832]">完成说明</label>
            <textarea
              v-model="checkinContent"
              rows="5"
              class="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm leading-relaxed"
              placeholder="描述本期完成情况（可与附件互证）"
            />
            <label class="mt-4 block text-sm font-medium text-[#2a3832]">附件链接</label>
            <div class="mt-2 space-y-2">
              <div
                v-for="(row, idx) in checkinAttachments"
                :key="idx"
                class="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2"
              >
                <input
                  v-model="row.url"
                  type="url"
                  class="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="https://… 或 local://文件名"
                />
                <input
                  v-model="row.fileName"
                  type="text"
                  class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm sm:w-40"
                  placeholder="显示名称（可选）"
                />
              </div>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-lg border border-[#dbe6df] bg-[#f6f8f6] px-3 py-1.5 text-xs font-semibold text-[#111813] hover:bg-[#eef3ef]"
                @click="addCheckinAttachmentRow"
              >
                增加一行链接
              </button>
              <label
                class="inline-flex cursor-pointer items-center rounded-lg border border-[#dbe6df] bg-white px-3 py-1.5 text-xs font-semibold text-[#111813] hover:bg-[#f6f8f6]"
              >
                选择文件（占位）
                <input
                  type="file"
                  class="sr-only"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.txt,.md"
                  @change="onCheckinFilesPicked(($event.target as HTMLInputElement).files)"
                />
              </label>
            </div>
            <div class="mt-5 flex justify-end gap-2">
              <button
                type="button"
                class="rounded-lg px-4 py-2 text-sm font-semibold text-[#61896f]"
                :disabled="checkinSaving"
                @click="checkinOpen = false"
              >
                取消
              </button>
              <button
                type="button"
                class="rounded-lg bg-[#111813] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                :disabled="checkinSaving"
                data-testid="schedule-checkin-submit"
                @click="submitCheckin"
              >
                {{ checkinSaving ? '提交中…' : '提交' }}
              </button>
            </div>
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
</style>
