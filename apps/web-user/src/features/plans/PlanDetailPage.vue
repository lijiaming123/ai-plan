<script setup lang="ts">
import { computed, onMounted, reactive, ref, toRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import UiErrorToast from "../../components/UiErrorToast.vue";
import PlanPomodoroBar from "../../components/PlanPomodoroBar.vue";
import PlanDetailHeader from "./detail/components/PlanDetailHeader.vue";
import PlanDetailRequirement from "./detail/components/PlanDetailRequirement.vue";
import PlanDetailContinuationPanel from "./detail/components/PlanDetailContinuationPanel.vue";
import PlanDetailScheduleSection from "./detail/components/PlanDetailScheduleSection.vue";
import PlanDetailCheckinDialog from "./detail/components/PlanDetailCheckinDialog.vue";
import PlanDetailSubmissionDrawers from "./detail/components/PlanDetailSubmissionDrawers.vue";
import PlanScheduleEditDialog from "./shared/components/PlanScheduleEditDialog.vue";
import { usePlanDetailLoader } from "./detail/composables/usePlanDetailLoader";
import { useScheduleEdit } from "./detail/composables/useScheduleEdit";
import { usePlanDetailCheckin } from "./detail/composables/usePlanDetailCheckin";
import { usePlanScheduleSlots } from "./shared/composables/usePlanScheduleSlots";
import { useCloseOnEscape } from "../../composables/useCloseOnEscape";

const route = useRoute();
const router = useRouter();
const planId = computed(() => String(route.params.id ?? ""));

const errorToastMessage = ref("");
const okBanner = ref("");
const showGoArchiveFromBanner = ref(false);
const lastOpenedCheckinQueryKey = ref("");

function showError(message: string) {
  errorToastMessage.value = message;
}

function clearError() {
  errorToastMessage.value = "";
}

const {
  loading,
  plan,
  isDraft,
  isArchived,
  isTravelPlan,
  isGeneralPlan,
  executionSnapshot,
  checkinSchedule,
  slotSubmissions,
  planFullySubmitted,
  isPastPlanDeadline,
  canSubmitCheckin,
  breadcrumbTail,
  breadcrumbTailTitle,
  statusLabel,
  typeLabel,
  loadPlanDetail,
} = usePlanDetailLoader(planId, showError);

const { isCurrentSlot, scheduleRowClass, scheduleRowLeftMarkClass } =
  usePlanScheduleSlots(checkinSchedule);

const checkin = reactive(
  usePlanDetailCheckin({
    planId,
    plan,
    isTravelPlan,
    isGeneralPlan,
    slotSubmissions,
    showError,
    okBanner,
    loadPlanDetail,
  }),
);

const scheduleEditApi = useScheduleEdit({
  planId,
  plan,
  executionSnapshot,
  showError,
  okBanner,
  slotSubmissions,
  isTravelPlan,
  appealWithdrawKey: toRef(checkin, "appealWithdrawKey"),
  slotCheckinStateLabel: checkin.slotCheckinStateLabel,
});

const {
  scheduleEditOpen,
  scheduleEditContent,
  scheduleEditSlotKey,
  scheduleSaving,
} = scheduleEditApi;

useCloseOnEscape(scheduleEditOpen, () => {
  scheduleEditOpen.value = false;
});
useCloseOnEscape(toRef(checkin, "checkinOpen"), () => {
  checkin.checkinOpen = false;
});
useCloseOnEscape(toRef(checkin, "submissionDrawerOpen"), () => {
  checkin.submissionDrawerOpen = false;
});

async function onPlanArchived() {
  await loadPlanDetail();
  okBanner.value = "已移入归档。可在侧栏「归档」中查看或恢复。";
  showGoArchiveFromBanner.value = true;
  window.setTimeout(() => {
    okBanner.value = "";
    showGoArchiveFromBanner.value = false;
  }, 4000);
}

async function onPlanUnarchived() {
  await loadPlanDetail();
  okBanner.value = "已移回「我的计划」，可继续执行与打卡。";
  showGoArchiveFromBanner.value = false;
  window.setTimeout(() => {
    okBanner.value = "";
  }, 4000);
}

function goArchiveFromBanner() {
  showGoArchiveFromBanner.value = false;
  okBanner.value = "";
  void router.push("/archive");
}

onMounted(loadPlanDetail);

watch(
  () => route.params.id,
  () => {
    lastOpenedCheckinQueryKey.value = "";
    void loadPlanDetail();
  },
);

watch(
  [
    () => route.query.openCheckin,
    () => route.query.slotKey,
    canSubmitCheckin,
    checkinSchedule,
    () => plan.value?.type,
  ],
  () => {
    if (route.query.openCheckin !== "1") return;
    const sk = route.query.slotKey;
    if (typeof sk !== "string" || !checkinSchedule.value) return;
    if (!canSubmitCheckin.value) return;
    const key = `${planId.value}|${sk}`;
    if (key === lastOpenedCheckinQueryKey.value) return;
    const slot = checkinSchedule.value.slots.find((s) => s.slotKey === sk);
    if (!slot) return;
    lastOpenedCheckinQueryKey.value = key;
    if (isTravelPlan.value)
      checkin.openTravelRecordDrawer(sk, slot.content);
    else checkin.openCheckinSubmit(sk, slot.content);
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
      class="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 shadow-lg ring-1 ring-emerald-200/90"
      role="status"
      data-testid="plan-ok-banner"
    >
      <div class="flex items-center gap-2">
        <span class="min-w-0 truncate">{{ okBanner }}</span>
        <button
          v-if="showGoArchiveFromBanner"
          type="button"
          class="pointer-events-auto shrink-0 rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-emerald-900 ring-1 ring-emerald-200/70 transition hover:bg-white"
          data-testid="go-archive-from-banner"
          @click="goArchiveFromBanner"
        >
          去归档看看
        </button>
      </div>
    </div>

    <div class="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-6">
      <PlanDetailHeader
        :plan="plan"
        :loading="loading"
        :plan-id="planId"
        :is-draft="isDraft"
        :is-archived="isArchived"
        :is-past-plan-deadline="isPastPlanDeadline"
        :checkin-schedule="checkinSchedule"
        :status-label="statusLabel"
        :type-label="typeLabel"
        :breadcrumb-tail="breadcrumbTail"
        :breadcrumb-tail-title="breadcrumbTailTitle"
      />

      <PlanPomodoroBar
        v-if="plan && plan.status === 'active' && !isArchived"
        :key="plan.id"
        :title="plan.goal"
      />

      <PlanDetailContinuationPanel
        v-if="plan && !isDraft"
        :plan="plan"
        :plan-id="planId"
        :loading="loading"
        :is-archived="isArchived"
        :plan-fully-submitted="planFullySubmitted"
        :show-error="showError"
        :ok-banner="okBanner"
      />

      <PlanDetailScheduleSection
        v-if="checkinSchedule"
        :checkin-schedule="checkinSchedule"
        :plan="plan"
        :is-archived="isArchived"
        :is-travel-plan="isTravelPlan"
        :is-general-plan="isGeneralPlan"
        :is-past-plan-deadline="isPastPlanDeadline"
        :can-submit-checkin="canSubmitCheckin"
        :schedule-saving="scheduleSaving"
        :checkin-saving="checkin.checkinSaving"
        :appeal-withdraw-key="checkin.appealWithdrawKey"
        :schedule-row-class="scheduleRowClass"
        :schedule-row-left-mark-class="scheduleRowLeftMarkClass"
        :is-current-slot="isCurrentSlot"
        :slot-submissions="slotSubmissions"
        :slot-checkin-state-label="checkin.slotCheckinStateLabel"
        :slot-checkin-state-pill-class="checkin.slotCheckinStatePillClass"
        :slot-submission-summary="checkin.slotSubmissionSummary"
        :slot-has-passed-submission="scheduleEditApi.slotHasPassedSubmission"
        :slot-more-actions="scheduleEditApi.slotMoreActions"
        @open-checkin-submit="checkin.openCheckinSubmit"
        @open-schedule-edit="scheduleEditApi.openScheduleEdit"
        @restore-schedule-slot="scheduleEditApi.restoreScheduleSlot"
        @withdraw-slot-appeal="checkin.withdrawSlotAppeal"
        @open-submission-history="checkin.openSubmissionHistory"
        @toggle-travel-slot-completion="checkin.toggleTravelSlotCompletion"
        @open-travel-record-drawer="checkin.openTravelRecordDrawer"
        @open-general-note-drawer="checkin.openGeneralNoteDrawer"
      />

      <PlanDetailRequirement
        v-if="plan && plan.requirement && (plan.status === 'active' || isArchived)"
        :plan="plan"
        :is-draft="isDraft"
        :is-archived="isArchived"
        :show-error="showError"
        @archived="onPlanArchived"
        @unarchived="onPlanUnarchived"
      />

      <PlanScheduleEditDialog
        v-model:open="scheduleEditOpen"
        v-model:content="scheduleEditContent"
        variant="detail"
        :slot-key="scheduleEditSlotKey"
        :saving="scheduleSaving"
        @save="scheduleEditApi.saveScheduleEdit"
      />

      <PlanDetailCheckinDialog
        v-model:open="checkin.checkinOpen"
        :slot-key="checkin.checkinSlotKey"
        :slot-plan-text="checkin.checkinSlotPlanText"
        v-model:content="checkin.checkinContent"
        :uploaded-files="checkin.checkinUploadedFiles"
        :manual-links="checkin.checkinManualLinks"
        :saving="checkin.checkinSaving"
        :file-uploading="checkin.checkinFileUploading"
        :drop-active="checkin.checkinDropActive"
        :upload-progress="checkin.checkinUploadProgress"
        :review="checkin.checkinReview"
        v-model:appeal-text="checkin.checkinAppealText"
        :appeal-submitting="checkin.appealSubmitting"
        :is-travel-plan="isTravelPlan"
        :checkin-band-label="checkin.checkinBandLabel"
        :on-drop-active="(v) => (checkin.checkinDropActive = v)"
        :on-drop="checkin.onCheckinDrop"
        @submit="checkin.submitCheckin"
        @submit-appeal="checkin.submitCheckinAppeal"
        @files-picked="checkin.onCheckinFilesPicked"
        @remove-uploaded="checkin.removeCheckinUploaded"
        @remove-manual-row="checkin.removeCheckinManualRow"
        @add-manual-link-row="checkin.addCheckinManualLinkRow"
      />

      <PlanDetailSubmissionDrawers
        v-model:open="checkin.submissionDrawerOpen"
        :slot-key="checkin.submissionDrawerSlotKey"
        :plan-text="checkin.submissionDrawerPlanText"
        :submissions="slotSubmissions(checkin.submissionDrawerSlotKey)"
        :is-travel-plan="isTravelPlan"
        :is-general-plan="isGeneralPlan"
        v-model:checkin-content="checkin.checkinContent"
        :checkin-uploaded-files="checkin.checkinUploadedFiles"
        :checkin-manual-links="checkin.checkinManualLinks"
        :checkin-saving="checkin.checkinSaving"
        :checkin-file-uploading="checkin.checkinFileUploading"
        :checkin-drop-active="checkin.checkinDropActive"
        :checkin-upload-progress="checkin.checkinUploadProgress"
        :on-drop-active="(v) => (checkin.checkinDropActive = v)"
        :on-drop="checkin.onCheckinDrop"
        @submit-checkin="checkin.submitCheckin"
        @submit-general-note="checkin.submitGeneralNote"
        @files-picked="checkin.onCheckinFilesPicked"
        @remove-uploaded="checkin.removeCheckinUploaded"
        @remove-manual-row="checkin.removeCheckinManualRow"
        @add-manual-link-row="checkin.addCheckinManualLinkRow"
      />

      <section
        v-if="isDraft"
        class="mb-6 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950"
        data-testid="plan-detail-draft-banner"
      >
        <p class="font-bold">该计划仍处于草稿阶段</p>
        <p class="mt-1 text-amber-900/90">
          请前往草稿页对比版本并确认后，再在打卡计划中提交执行记录。
        </p>
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
.checkin-link-details[open] .checkin-details-chevron {
  display: inline-block;
  transform: rotate(90deg);
}
</style>
