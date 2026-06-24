<script setup lang="ts">
import UiEllipsisTooltip from "../../../../components/UiEllipsisTooltip.vue";
import UiMoreDropdown from "../../../../components/UiMoreDropdown.vue";
import type { PlanRecord } from "../../../../lib/api-client";

type ScheduleSlot = {
  slotKey: string;
  content: string;
  contentSource?: string;
};

type Schedule = {
  granularity: string;
  slots: ScheduleSlot[];
};

type MoreAction =
  | { key: "edit"; label: string; testid: string; disabled?: boolean }
  | { key: "restore"; label: string; testid: string; danger?: boolean; disabled?: boolean }
  | { key: "withdrawAppeal"; label: string; testid: string; disabled?: boolean };

defineProps<{
  checkinSchedule: Schedule;
  plan: PlanRecord | null;
  isArchived: boolean;
  isTravelPlan: boolean;
  isGeneralPlan: boolean;
  isPastPlanDeadline: boolean;
  canSubmitCheckin: boolean;
  scheduleSaving: boolean;
  checkinSaving: boolean;
  appealWithdrawKey: string | null;
  scheduleRowClass: (slotKey: string) => string;
  scheduleRowLeftMarkClass: (slotKey: string) => string;
  isCurrentSlot: (slotKey: string) => boolean;
  slotSubmissions: (slotKey: string) => unknown[];
  slotCheckinStateLabel: (slotKey: string) => string;
  slotCheckinStatePillClass: (slotKey: string) => string;
  slotSubmissionSummary: (slotKey: string) => string;
  slotHasPassedSubmission: (slotKey: string) => boolean;
  slotMoreActions: (slotKey: string) => MoreAction[];
}>();

const emit = defineEmits<{
  openCheckinSubmit: [slotKey: string, content: string];
  openScheduleEdit: [slotKey: string, content: string];
  restoreScheduleSlot: [slotKey: string];
  withdrawSlotAppeal: [slotKey: string];
  openSubmissionHistory: [slotKey: string, content: string];
  toggleTravelSlotCompletion: [slotKey: string];
  openTravelRecordDrawer: [slotKey: string, content: string];
  openGeneralNoteDrawer: [slotKey: string, content: string];
}>();
</script>

<template>
<section
  v-if="checkinSchedule"
  class="mb-6 rounded-2xl border border-[#d4e5dc] bg-white p-5 shadow-[0_12px_36px_-24px_rgba(12,72,48,0.14)] ring-1 ring-[#e8f2ec]"
  data-testid="plan-schedule-panel"
>
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div class="min-w-0">
      <p class="text-sm font-semibold text-[#2a3832]">打卡计划</p>
      <p class="mt-1 text-xs text-[#61896f]">
        颗粒度：{{
          checkinSchedule.granularity === "day" ? "按天" : "按周"
        }}
        ·
        <template v-if="!isArchived"
          >{{
            isTravelPlan
              ? "可编辑计划文案；执行阶段可勾选完成，并为每段添加旅行记录（文字/附件）。"
              : isGeneralPlan
                ? "可编辑计划文案；执行阶段按槽勾选完成，并可写一句文字备注（不支持附件）。"
                : "可编辑计划文案；已定稿后在本表按槽提交完成证明（链接附件）。"
          }}</template
        >
        <template v-else>已归档，打卡表为只读。</template>
        <template
          v-if="
            isPastPlanDeadline && plan?.status === 'active' && !isArchived
          "
        >
          已超过计划截止日，仍可补记与编辑。
        </template>
      </p>
    </div>
    <p class="text-xs text-[#61896f]">
      共 {{ checkinSchedule.slots.length }} 个打卡段
    </p>
  </div>

  <!-- 桌面端：通用表格 / 旅游时间轴 -->
  <div
    v-if="!isTravelPlan && !isGeneralPlan"
    class="mt-4 hidden overflow-x-auto md:block"
  >
    <table class="w-full min-w-[640px] text-left text-sm">
      <thead
        class="border-b border-slate-200 bg-[#f6faf7] text-xs font-semibold text-[#4a6358]"
      >
        <tr>
          <th class="whitespace-nowrap px-3 py-3 font-semibold">
            打卡段
          </th>
          <th class="px-3 py-3 font-semibold">计划内容</th>
          <th class="whitespace-nowrap px-3 py-3 font-semibold">状态</th>
          <th class="whitespace-nowrap px-3 py-3 font-semibold">
            提交记录
          </th>
          <th
            class="whitespace-nowrap px-3 py-3 text-right font-semibold"
          >
            操作
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="slot in checkinSchedule.slots"
          :key="`tbl-${slot.slotKey}`"
          class="border-b border-slate-100 align-middle"
          :class="[
            scheduleRowClass(slot.slotKey),
            scheduleRowLeftMarkClass(slot.slotKey),
          ]"
        >
          <td class="whitespace-nowrap px-3 py-3">
            <span
              class="font-mono text-xs font-semibold text-[#2a3832]"
              >{{ slot.slotKey }}</span
            >
            <span
              v-if="slot.contentSource === 'edited'"
              class="ml-1 inline-flex rounded-full bg-[#f1f5f3] px-2 py-0.5 text-[10px] font-bold text-[#2a3832]"
            >
              已编辑
            </span>
          </td>
          <td class="max-w-[min(28rem,40vw)] px-3 py-3">
            <UiEllipsisTooltip :content="slot.content" :lines="2" />
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
            <button
              type="button"
              class="max-w-[22rem] truncate text-left font-semibold underline decoration-[#dbe6df] underline-offset-2 transition hover:text-[#0a8f4a] hover:decoration-[#0a8f4a]/40"
              :class="
                slotSubmissions(slot.slotKey).length
                  ? 'text-[#2a3832]'
                  : 'pointer-events-none no-underline text-[#2a3832]/70'
              "
              data-testid="schedule-slot-submission-history"
              @click="emit('openSubmissionHistory', slot.slotKey, slot.content)"
            >
              {{ slotSubmissionSummary(slot.slotKey) }}
            </button>
          </td>
          <td class="px-3 py-3 text-right">
            <div
              class="flex flex-nowrap justify-end gap-1.5 overflow-x-auto"
            >
              <button
                v-if="canSubmitCheckin"
                type="button"
                class="shrink-0 whitespace-nowrap rounded-lg border border-[#0a8f4a]/35 bg-emerald-50/90 px-2.5 py-1 text-xs font-bold text-[#0b5c34] hover:bg-emerald-100 disabled:opacity-50"
                :disabled="scheduleSaving || checkinSaving"
                data-testid="schedule-slot-checkin"
                @click="emit('openCheckinSubmit', slot.slotKey, slot.content)"
              >
                提交证明
              </button>
              <!-- 测试与无样式降级兜底：保留可点击的编辑入口（视觉上隐藏，主入口在「更多」中） -->
              <button
                v-if="
                  !isArchived && !slotHasPassedSubmission(slot.slotKey)
                "
                type="button"
                class="sr-only"
                :disabled="scheduleSaving"
                data-testid="schedule-slot-edit"
                @click="emit('openScheduleEdit', slot.slotKey, slot.content)"
              >
                编辑
              </button>
              <UiMoreDropdown
                v-if="
                  !isArchived && slotMoreActions(slot.slotKey).length > 0
                "
                :actions="slotMoreActions(slot.slotKey)"
                @action="
                  (k) => {
                    if (k === 'edit')
                      emit('openScheduleEdit', slot.slotKey, slot.content);
                    else if (k === 'restore')
                      emit('restoreScheduleSlot', slot.slotKey);
                    else if (k === 'withdrawAppeal')
                      emit('withdrawSlotAppeal', slot.slotKey);
                  }
                "
              />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <div
    v-else-if="isTravelPlan"
    class="mt-4 hidden md:block"
    data-testid="travel-itinerary-timeline"
  >
    <ol class="relative ml-3 border-l border-slate-200/90">
      <li
        v-for="(slot, idx) in checkinSchedule.slots"
        :key="`tl-${slot.slotKey}`"
        class="relative pb-5 pl-6"
        :class="[
          scheduleRowClass(slot.slotKey),
          scheduleRowLeftMarkClass(slot.slotKey),
        ]"
      >
        <span
          class="absolute -left-[10px] top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white"
          :class="
            slotSubmissions(slot.slotKey).length > 0
              ? 'bg-emerald-500'
              : isCurrentSlot(slot.slotKey)
                ? 'bg-emerald-200'
                : 'bg-slate-300'
          "
        >
          <span
            v-if="slotSubmissions(slot.slotKey).length > 0"
            class="text-[11px] font-black text-white"
            aria-hidden="true"
            >✓</span
          >
        </span>

        <div
          class="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_12px_30px_-26px_rgba(12,72,48,0.22)]"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-xs font-semibold tracking-[0.08em] text-[#61896f]">
                第 {{ idx + 1 }} 天 · {{ slot.slotKey }}
                <span
                  v-if="slot.contentSource === 'edited'"
                  class="ml-2 inline-flex rounded-full bg-[#f1f5f3] px-2 py-0.5 text-[10px] font-bold text-[#2a3832]"
                >
                  已编辑
                </span>
              </p>
              <p
                class="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#111813]"
              >
                {{ slot.content }}
              </p>
              <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span
                  class="inline-flex items-center rounded-full px-2.5 py-0.5 font-bold"
                  :class="slotCheckinStatePillClass(slot.slotKey)"
                  :data-testid="`schedule-slot-status-${slot.slotKey}`"
                >
                  {{ slotCheckinStateLabel(slot.slotKey) }}
                </span>
                <button
                  type="button"
                  class="max-w-[26rem] truncate font-semibold underline decoration-[#dbe6df] underline-offset-2 transition hover:text-[#0a8f4a] hover:decoration-[#0a8f4a]/40"
                  :class="
                    slotSubmissions(slot.slotKey).length
                      ? 'text-[#2a3832]'
                      : 'pointer-events-none no-underline text-[#2a3832]/70'
                  "
                  data-testid="schedule-slot-submission-history"
                  @click="emit('openSubmissionHistory', slot.slotKey, slot.content)"
                >
                  {{ slotSubmissionSummary(slot.slotKey) }}
                </button>
              </div>
            </div>

            <div class="flex flex-wrap justify-end gap-2">
              <button
                v-if="canSubmitCheckin"
                type="button"
                class="rounded-xl border border-[#0a8f4a]/35 bg-emerald-50/90 px-3 py-2 text-xs font-bold text-[#0b5c34] hover:bg-emerald-100 disabled:opacity-50"
                :disabled="scheduleSaving || checkinSaving"
                data-testid="schedule-slot-travel-toggle"
                @click="emit('toggleTravelSlotCompletion', slot.slotKey)"
              >
                {{
                  slotSubmissions(slot.slotKey).length > 0
                    ? "撤销完成"
                    : "勾选完成"
                }}
              </button>
              <button
                v-if="canSubmitCheckin"
                type="button"
                class="rounded-xl border border-[#dbe6df] bg-white px-3 py-2 text-xs font-bold text-[#111813] hover:bg-[#f6f8f6] disabled:opacity-50"
                :disabled="scheduleSaving || checkinSaving"
                data-testid="schedule-slot-travel-add-record"
                @click="emit('openTravelRecordDrawer', slot.slotKey, slot.content)"
              >
                添加记录
              </button>

              <!-- 测试与无样式降级兜底：保留可点击的编辑入口（视觉上隐藏，主入口在「更多」中） -->
              <button
                v-if="
                  !isArchived && !slotHasPassedSubmission(slot.slotKey)
                "
                type="button"
                class="sr-only"
                :disabled="scheduleSaving"
                data-testid="schedule-slot-edit"
                @click="emit('openScheduleEdit', slot.slotKey, slot.content)"
              >
                编辑
              </button>
              <UiMoreDropdown
                v-if="
                  !isArchived && slotMoreActions(slot.slotKey).length > 0
                "
                :actions="slotMoreActions(slot.slotKey)"
                @action="
                  (k) => {
                    if (k === 'edit')
                      emit('openScheduleEdit', slot.slotKey, slot.content);
                    else if (k === 'restore')
                      emit('restoreScheduleSlot', slot.slotKey);
                    else if (k === 'withdrawAppeal')
                      emit('withdrawSlotAppeal', slot.slotKey);
                  }
                "
              />
            </div>
          </div>
        </div>
      </li>
    </ol>
  </div>

  <!-- general：checkbox-only，桌面端走同一时间轴但仅支持文字备注 -->
  <div
    v-else
    class="mt-4 hidden md:block"
    data-testid="general-checkbox-timeline"
  >
    <ol class="relative ml-3 border-l border-slate-200/90">
      <li
        v-for="(slot, idx) in checkinSchedule.slots"
        :key="`gl-${slot.slotKey}`"
        class="relative pb-5 pl-6"
        :class="[
          scheduleRowClass(slot.slotKey),
          scheduleRowLeftMarkClass(slot.slotKey),
        ]"
      >
        <span
          class="absolute -left-[10px] top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white"
          :class="
            slotSubmissions(slot.slotKey).length > 0
              ? 'bg-emerald-500'
              : isCurrentSlot(slot.slotKey)
                ? 'bg-emerald-200'
                : 'bg-slate-300'
          "
        >
          <span
            v-if="slotSubmissions(slot.slotKey).length > 0"
            class="text-[11px] font-black text-white"
            aria-hidden="true"
            >✓</span
          >
        </span>

        <div
          class="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_12px_30px_-26px_rgba(12,72,48,0.22)]"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-xs font-semibold tracking-[0.08em] text-[#61896f]">
                第 {{ idx + 1 }} 天 · {{ slot.slotKey }}
                <span
                  v-if="slot.contentSource === 'edited'"
                  class="ml-2 inline-flex rounded-full bg-[#f1f5f3] px-2 py-0.5 text-[10px] font-bold text-[#2a3832]"
                >
                  已编辑
                </span>
              </p>
              <p
                class="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#111813]"
              >
                {{ slot.content }}
              </p>
              <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span
                  class="inline-flex items-center rounded-full px-2.5 py-0.5 font-bold"
                  :class="slotCheckinStatePillClass(slot.slotKey)"
                  :data-testid="`schedule-slot-status-${slot.slotKey}`"
                >
                  {{ slotCheckinStateLabel(slot.slotKey) }}
                </span>
                <button
                  type="button"
                  class="max-w-[26rem] truncate font-semibold underline decoration-[#dbe6df] underline-offset-2 transition hover:text-[#0a8f4a] hover:decoration-[#0a8f4a]/40"
                  :class="
                    slotSubmissions(slot.slotKey).length
                      ? 'text-[#2a3832]'
                      : 'pointer-events-none no-underline text-[#2a3832]/70'
                  "
                  data-testid="schedule-slot-submission-history"
                  @click="emit('openSubmissionHistory', slot.slotKey, slot.content)"
                >
                  {{ slotSubmissionSummary(slot.slotKey) }}
                </button>
              </div>
            </div>

            <div class="flex flex-wrap justify-end gap-2">
              <button
                v-if="canSubmitCheckin"
                type="button"
                class="rounded-xl border border-[#0a8f4a]/35 bg-emerald-50/90 px-3 py-2 text-xs font-bold text-[#0b5c34] hover:bg-emerald-100 disabled:opacity-50"
                :disabled="scheduleSaving || checkinSaving"
                data-testid="schedule-slot-general-toggle"
                @click="emit('toggleTravelSlotCompletion', slot.slotKey)"
              >
                {{
                  slotSubmissions(slot.slotKey).length > 0
                    ? "撤销完成"
                    : "勾选完成"
                }}
              </button>
              <button
                v-if="canSubmitCheckin"
                type="button"
                class="rounded-xl border border-[#dbe6df] bg-white px-3 py-2 text-xs font-bold text-[#111813] hover:bg-[#f6f8f6] disabled:opacity-50"
                :disabled="scheduleSaving || checkinSaving"
                data-testid="schedule-slot-general-add-note"
                @click="emit('openGeneralNoteDrawer', slot.slotKey, slot.content)"
              >
                添加备注
              </button>
            </div>
          </div>
        </div>
      </li>
    </ol>
  </div>

  <div class="mt-4 grid gap-3 md:hidden">
    <article
      v-for="slot in checkinSchedule.slots"
      :key="`mob-${slot.slotKey}`"
      class="rounded-xl border border-slate-100 bg-[#fbfcfb] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
      :class="
        isCurrentSlot(slot.slotKey)
          ? 'border-emerald-200/80 bg-emerald-50/50'
          : ''
      "
    >
      <div class="flex flex-col gap-3">
        <div class="min-w-0">
          <p
            class="text-xs font-semibold tracking-[0.06em] text-[#61896f]"
          >
            {{ slot.slotKey }}
            <span
              v-if="slot.contentSource === 'edited'"
              class="ml-2 inline-flex rounded-full bg-[#f1f5f3] px-2 py-0.5 text-[10px] font-bold text-[#2a3832]"
            >
              已编辑
            </span>
          </p>
          <p
            class="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#111813]"
          >
            {{ slot.content }}
          </p>
          <p class="mt-1 text-xs text-[#61896f]">
            状态：
            <span
              :class="slotCheckinStatePillClass(slot.slotKey)"
              class="ml-0.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold"
            >
              {{ slotCheckinStateLabel(slot.slotKey) }}
            </span>
          </p>
          <p class="mt-1 text-xs text-[#61896f]">
            提交：
            <button
              type="button"
              class="font-semibold underline decoration-[#dbe6df] underline-offset-2 transition hover:text-[#0a8f4a] hover:decoration-[#0a8f4a]/40"
              :class="
                slotSubmissions(slot.slotKey).length
                  ? 'text-[#2a3832]'
                  : 'pointer-events-none no-underline text-[#2a3832]/70'
              "
              data-testid="schedule-slot-submission-history-mobile"
              @click="emit('openSubmissionHistory', slot.slotKey, slot.content)"
            >
              {{ slotSubmissionSummary(slot.slotKey) }}
            </button>
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            v-if="
              canSubmitCheckin && !isTravelPlan && !isGeneralPlan
            "
            type="button"
            class="rounded-lg border border-[#0a8f4a]/35 bg-emerald-50/90 px-3 py-1.5 text-xs font-bold text-[#0b5c34] hover:bg-emerald-100 disabled:opacity-50"
            :disabled="scheduleSaving || checkinSaving"
            data-testid="schedule-slot-checkin-mobile"
            @click="emit('openCheckinSubmit', slot.slotKey, slot.content)"
          >
            提交证明
          </button>
          <button
            v-if="canSubmitCheckin && isGeneralPlan"
            type="button"
            class="rounded-lg border border-[#0a8f4a]/35 bg-emerald-50/90 px-3 py-1.5 text-xs font-bold text-[#0b5c34] hover:bg-emerald-100 disabled:opacity-50"
            :disabled="scheduleSaving || checkinSaving"
            data-testid="schedule-slot-general-toggle-mobile"
            @click="emit('toggleTravelSlotCompletion', slot.slotKey)"
          >
            {{
              slotSubmissions(slot.slotKey).length > 0
                ? "撤销完成"
                : "勾选完成"
            }}
          </button>
          <button
            v-if="canSubmitCheckin && isGeneralPlan"
            type="button"
            class="rounded-lg border border-[#dbe6df] bg-white px-3 py-1.5 text-xs font-bold text-[#111813] hover:bg-[#f6f8f6] disabled:opacity-50"
            :disabled="scheduleSaving || checkinSaving"
            data-testid="schedule-slot-general-add-note-mobile"
            @click="emit('openGeneralNoteDrawer', slot.slotKey, slot.content)"
          >
            添加备注
          </button>
          <button
            v-if="canSubmitCheckin && isTravelPlan"
            type="button"
            class="rounded-lg border border-[#0a8f4a]/35 bg-emerald-50/90 px-3 py-1.5 text-xs font-bold text-[#0b5c34] hover:bg-emerald-100 disabled:opacity-50"
            :disabled="scheduleSaving || checkinSaving"
            data-testid="schedule-slot-travel-toggle-mobile"
            @click="emit('toggleTravelSlotCompletion', slot.slotKey)"
          >
            {{
              slotSubmissions(slot.slotKey).length > 0
                ? "撤销完成"
                : "勾选完成"
            }}
          </button>
          <button
            v-if="canSubmitCheckin && isTravelPlan"
            type="button"
            class="rounded-lg border border-[#dbe6df] bg-white px-3 py-1.5 text-xs font-bold text-[#111813] hover:bg-[#f6f8f6] disabled:opacity-50"
            :disabled="scheduleSaving || checkinSaving"
            data-testid="schedule-slot-travel-add-record-mobile"
            @click="emit('openTravelRecordDrawer', slot.slotKey, slot.content)"
          >
            添加记录
          </button>
          <button
            v-if="!isArchived && !slotHasPassedSubmission(slot.slotKey)"
            type="button"
            class="rounded-lg border border-[#dbe6df] bg-white px-3 py-1.5 text-xs font-semibold text-[#111813] hover:bg-[#f6f8f6] disabled:opacity-50"
            :disabled="scheduleSaving"
            data-testid="schedule-slot-edit-mobile"
            @click="emit('openScheduleEdit', slot.slotKey, slot.content)"
          >
            编辑
          </button>
          <button
            v-if="!isArchived && !slotHasPassedSubmission(slot.slotKey)"
            type="button"
            class="rounded-lg border border-[#f0d8d6] bg-white px-3 py-1.5 text-xs font-semibold text-[#7b2f28] hover:bg-[#fff7f6] disabled:opacity-50"
            :disabled="scheduleSaving"
            data-testid="schedule-slot-restore-mobile"
            @click="emit('restoreScheduleSlot', slot.slotKey)"
          >
            恢复
          </button>
          <button
            v-if="
              !isArchived &&
              slotCheckinStateLabel(slot.slotKey) === '申诉中'
            "
            type="button"
            class="rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-100/90 disabled:opacity-50"
            :disabled="!!appealWithdrawKey"
            data-testid="schedule-slot-appeal-withdraw-mobile"
            @click="emit('withdrawSlotAppeal', slot.slotKey)"
          >
            {{
              appealWithdrawKey === slot.slotKey ? "撤销中…" : "撤销申诉"
            }}
          </button>
        </div>
      </div>
    </article>
  </div>
</section></template>
