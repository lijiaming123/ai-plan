<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UiErrorToast from '../../components/UiErrorToast.vue';
import type { PlanRecord } from '../../lib/api-client';
import { getApiClient } from '../../lib/api-client';
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
  scheduleSaving.value = true;
  try {
    const res = await getApiClient().patchPlanScheduleSlot({
      id: planId.value,
      slotKey,
      token: authState.token,
      content: scheduleEditContent.value,
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
  scheduleSaving.value = true;
  try {
    const res = await getApiClient().patchPlanScheduleSlot({
      id: planId.value,
      slotKey,
      token: authState.token,
      restore: true,
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
  <div class="flex h-full min-h-0 w-full flex-col overflow-y-auto bg-background-light font-display text-[#111813]">
    <UiErrorToast :message="errorToastMessage" @close="clearError" />

    <div class="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
        <div class="mb-6 flex flex-wrap gap-2">
          <router-link to="/plans" class="text-base font-medium text-[#61896f]">我的计划</router-link>
          <span class="text-base font-medium text-[#61896f]">/</span>
          <span class="text-base font-medium">计划 {{ planId }}</span>
        </div>

        <section class="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p class="text-3xl font-black tracking-[-0.03em]">{{ plan ? plan.goal : '计划详情' }}</p>
          <p class="mt-2 text-sm text-[#61896f]">
            状态：{{ plan && plan.status === 'active' ? '执行中' : '草稿' }}
            <span v-if="plan && plan.deadline"> · 截止 {{ plan.deadline }}</span>
          </p>
          <p
            v-if="plan && plan.requirement && plan.status === 'active'"
            class="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-[#2a3832]"
          >
            {{ plan.requirement }}
          </p>
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
          class="mb-6 rounded-xl border border-[#dfe9e3] bg-white p-5 shadow-sm"
          data-testid="plan-schedule-panel"
        >
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-[#2a3832]">打卡计划</p>
              <p class="mt-1 text-xs text-[#61896f]">
                颗粒度：{{ checkinSchedule.granularity === 'day' ? '按天' : '按周' }} · 仅支持编辑内容文本（不改时间槽）
              </p>
            </div>
            <p class="text-xs text-[#61896f]">共 {{ checkinSchedule.slots.length }} 个时间槽</p>
          </div>

          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <article
              v-for="slot in checkinSchedule.slots"
              :key="slot.slotKey"
              class="rounded-xl border border-slate-100 bg-[#fbfcfb] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-xs font-semibold tracking-[0.08em] text-[#61896f]">
                    {{ slot.slotKey }}
                    <span
                      v-if="slot.contentSource === 'edited'"
                      class="ml-2 inline-flex rounded-full bg-[#f1f5f3] px-2 py-0.5 text-[10px] font-bold text-[#2a3832]"
                    >
                      已编辑
                    </span>
                  </p>
                  <p class="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#111813]">{{ slot.content }}</p>
                </div>
                <div class="flex flex-col gap-2">
                  <button
                    type="button"
                    class="rounded-lg border border-[#dbe6df] bg-white px-3 py-1.5 text-xs font-semibold text-[#111813] hover:bg-[#f6f8f6] disabled:opacity-50"
                    :disabled="scheduleSaving"
                    @click="openScheduleEdit(slot.slotKey, slot.content)"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    class="rounded-lg border border-[#f0d8d6] bg-white px-3 py-1.5 text-xs font-semibold text-[#7b2f28] hover:bg-[#fff7f6] disabled:opacity-50"
                    :disabled="scheduleSaving"
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
  </div>
</template>
