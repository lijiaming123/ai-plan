<script setup lang="ts">
import UiCheckinSubmissionDrawer from "../../../../components/UiCheckinSubmissionDrawer.vue";
import PlanDetailGeneralNoteDrawer from "./PlanDetailGeneralNoteDrawer.vue";
import PlanDetailTravelRecordDrawer from "./PlanDetailTravelRecordDrawer.vue";

defineProps<{
  open: boolean;
  slotKey: string;
  planText: string;
  submissions: unknown[];
  isTravelPlan: boolean;
  isGeneralPlan: boolean;
  checkinContent: string;
  checkinUploadedFiles: Array<{ url: string; fileName: string }>;
  checkinManualLinks: Array<{ url: string; fileName: string }>;
  checkinSaving: boolean;
  checkinFileUploading: boolean;
  checkinDropActive: boolean;
  checkinUploadProgress: string;
  onDropActive: (active: boolean) => void;
  onDrop: (event: DragEvent) => void;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  "update:checkinContent": [value: string];
  submitCheckin: [];
  submitGeneralNote: [];
  filesPicked: [files: FileList | null];
  removeUploaded: [index: number];
  removeManualRow: [index: number];
  addManualLinkRow: [];
}>();
</script>

<template>
  <UiCheckinSubmissionDrawer
    :model-value="open"
    :slot-key="slotKey"
    :plan-text="planText"
    :submissions="submissions"
    :title="isTravelPlan ? '旅行记录' : undefined"
    :slot-prefix-label="isTravelPlan ? '本段行程' : undefined"
    :tip-text="
      isTravelPlan
        ? '可添加本段旅行的文字说明与附件（可选）；也可仅勾选完成。'
        : undefined
    "
    @update:model-value="emit('update:open', $event)"
  >
    <template v-if="isTravelPlan" #composer>
      <PlanDetailTravelRecordDrawer
        :content="checkinContent"
        :uploaded-files="checkinUploadedFiles"
        :manual-links="checkinManualLinks"
        :saving="checkinSaving"
        :file-uploading="checkinFileUploading"
        :drop-active="checkinDropActive"
        :upload-progress="checkinUploadProgress"
        :on-drop-active="onDropActive"
        :on-drop="onDrop"
        @update:content="emit('update:checkinContent', $event)"
        @submit="emit('submitCheckin')"
        @files-picked="emit('filesPicked', $event)"
        @remove-uploaded="emit('removeUploaded', $event)"
        @remove-manual-row="emit('removeManualRow', $event)"
        @add-manual-link-row="emit('addManualLinkRow')"
      />
    </template>

    <template v-else-if="isGeneralPlan" #composer>
      <PlanDetailGeneralNoteDrawer
        :content="checkinContent"
        :saving="checkinSaving"
        @update:content="emit('update:checkinContent', $event)"
        @submit="emit('submitGeneralNote')"
      />
    </template>
  </UiCheckinSubmissionDrawer>
</template>
