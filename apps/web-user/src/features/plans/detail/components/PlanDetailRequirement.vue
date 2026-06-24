<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import UiConfirmDialog from "../../../../components/UiConfirmDialog.vue";
import PlanDetailPublishTemplateDialog from "./PlanDetailPublishTemplateDialog.vue";
import type { PlanRecord } from "../../../../lib/api-client";
import { getApiClient } from "../../../../lib/api-client";
import { renderMarkdownToHtml } from "../../../../lib/render-markdown";
import { authState } from "../../../../stores/auth";
import { isTemplatesFeatureEnabled } from "../../../../lib/feature-flags";

const props = defineProps<{
  plan: PlanRecord;
  isDraft: boolean;
  isArchived: boolean;
  showError: (message: string) => void;
}>();

const emit = defineEmits<{
  archived: [];
  unarchived: [];
}>();

const router = useRouter();
const confirmArchiveOpen = ref(false);
const archiveSubmitting = ref(false);
const showPublishForm = ref(false);

const canPublishTemplate = computed(() => {
  if (!isTemplatesFeatureEnabled()) return false;
  const p = props.plan;
  if (!p || !authState.token || !authState.userId) return false;
  if (p.userId && p.userId !== authState.userId) return false;
  if (props.isArchived) return false;
  return p.status === "draft" || p.status === "active";
});

function renderRequirementMd(raw: string): string {
  return renderMarkdownToHtml(raw);
}

async function submitArchivePlan() {
  if (!authState.token) return;
  archiveSubmitting.value = true;
  try {
    await getApiClient().archivePlan({
      id: props.plan.id,
      token: authState.token,
    });
    confirmArchiveOpen.value = false;
    emit("archived");
  } catch (e) {
    props.showError(e instanceof Error ? e.message : "没归档成功，请稍后再试");
  } finally {
    archiveSubmitting.value = false;
  }
}

async function submitUnarchivePlan() {
  if (!authState.token) return;
  archiveSubmitting.value = true;
  try {
    await getApiClient().unarchivePlan({
      id: props.plan.id,
      token: authState.token,
    });
    emit("unarchived");
  } catch (e) {
    props.showError(e instanceof Error ? e.message : "没恢复成功，请稍后再试");
  } finally {
    archiveSubmitting.value = false;
  }
}
</script>

<template>
  <section
    v-if="plan.requirement && (plan.status === 'active' || isArchived)"
    class="mb-6 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_12px_36px_-24px_rgba(12,72,48,0.14)] ring-1 ring-slate-100"
    data-testid="plan-requirement-panel"
  >
    <div
      class="plan-detail-md p-5 sm:p-6"
      v-html="renderRequirementMd(plan.requirement)"
    />
    <div
      v-if="!isDraft && authState.token"
      class="flex flex-wrap items-center gap-2 border-t border-slate-200/70 bg-[#fbfcfb] px-5 py-3 sm:px-6"
      data-testid="plan-detail-bottom-actions"
    >
      <button
        v-if="plan.status === 'active' && !isArchived"
        type="button"
        class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
        data-testid="btn-archive-plan"
        @click="confirmArchiveOpen = true"
      >
        归档
      </button>
      <button
        v-if="isArchived"
        type="button"
        class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
        data-testid="btn-unarchive-plan"
        :disabled="archiveSubmitting"
        @click="submitUnarchivePlan"
      >
        {{ archiveSubmitting ? "处理中…" : "移回我的计划" }}
      </button>
      <button
        v-if="canPublishTemplate"
        type="button"
        class="rounded-lg border border-[#dbe6df] bg-[#f6f8f6] px-3 py-1.5 text-xs font-semibold text-[#111813] hover:bg-[#eef3ef]"
        data-testid="btn-publish-template"
        @click="showPublishForm = true"
      >
        发布为模板
      </button>
    </div>
  </section>

  <UiConfirmDialog
    v-model="confirmArchiveOpen"
    title="将计划移入归档？"
    confirm-text="确认归档"
    cancel-text="取消"
    :loading="archiveSubmitting"
    :close-on-confirm="false"
    data-testid="confirm-archive-dialog"
    @confirm="submitArchivePlan"
    @cancel="confirmArchiveOpen = false"
  >
    <template #description>
      <div
        class="mt-2 space-y-1 text-sm text-stone-600"
        data-testid="archive-explain"
      >
        <p>归档后会移出「我的计划」，进入「归档」。</p>
        <p>归档后仅可查看，不能打卡/编辑/申诉。</p>
        <p>需要继续时可随时「移回我的计划」。</p>
      </div>
    </template>
  </UiConfirmDialog>

  <PlanDetailPublishTemplateDialog
    v-if="showPublishForm"
    :plan="plan"
    @close="showPublishForm = false"
    @error="showError"
    @published="void router.push({ path: '/templates', query: { published: '1' } })"
  />
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
