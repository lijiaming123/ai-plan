<script setup lang="ts">
import { ElTooltip } from "element-plus";
import { computed } from "vue";
import type { PlanHeatmapDay } from "../lib/api-client";
import {
  buildMonthLabelsForColumns,
  buildYearHeatmapColumns,
  type HeatmapGridCell,
} from "../lib/plan-heatmap-grid";

const props = defineProps<{
  year: number;
  days: PlanHeatmapDay[];
}>();

const columns = computed(() => buildYearHeatmapColumns(props.year, props.days));

const monthLabels = computed(() => buildMonthLabelsForColumns(props.year, columns.value));

const rowLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

/** 与网格数据一致的本地日历 YYYY-MM-DD */
function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const todayYmd = computed(() => localYmd(new Date()));

function isTodayCell(cell: HeatmapGridCell): boolean {
  return Boolean(cell.date && cell.date === todayYmd.value);
}

function cellClass(cell: HeatmapGridCell): string {
  if (cell.status === "out" || !cell.date) {
    return "plan-heatmap-cell plan-heatmap-cell--out";
  }
  if (cell.status === "completed") {
    return "plan-heatmap-cell plan-heatmap-cell--done";
  }
  if (cell.status === "missed") {
    return "plan-heatmap-cell plan-heatmap-cell--missed";
  }
  return "plan-heatmap-cell plan-heatmap-cell--none";
}

function tooltipText(cell: HeatmapGridCell): string {
  if (!cell.date) return "";
  const parts = [`日期：${cell.date}`];
  if (isTodayCell(cell)) {
    parts.push("今天");
  }
  if (cell.summary) {
    parts.push(`应完成 ${cell.summary.due} 项，已完成 ${cell.summary.done} 项`);
  } else if (cell.status === "none") {
    parts.push("当日无计划打卡安排");
  } else if (cell.status === "completed") {
    parts.push("当日打卡已满足");
  } else {
    parts.push("当日有应打卡项未完成");
  }
  return parts.join("；");
}

function ariaLabel(cell: HeatmapGridCell): string {
  if (!cell.date) return "";
  return tooltipText(cell);
}
</script>

<template>
  <div
    class="plan-heatmap-root w-full overflow-x-auto pb-1"
    data-testid="plan-heatmap-grid"
  >
    <!-- 宽屏居中整块网格；内容超出时横向滚动，避免强行拉满导致「过长」 -->
    <div class="flex w-max min-w-full justify-center">
      <div class="inline-block min-w-min">
        <!-- 与数据行同一 flex：左侧周标签列占位 + gap，避免 padding 与内容宽度不一致导致列错位 -->
        <div class="plan-heatmap-row mb-1 flex items-end gap-3" aria-hidden="true">
          <div class="plan-heatmap-label-col shrink-0" />
          <div class="flex gap-[3px]">
            <div
              v-for="(lab, ci) in monthLabels"
              :key="`m-${ci}`"
              class="plan-heatmap-month-cell relative h-4 shrink-0"
            >
              <span
                v-if="lab"
                class="absolute left-0 top-0 z-[1] whitespace-nowrap text-[10px] font-semibold text-[#6e7b75]"
                >{{ lab }}</span
              >
            </div>
          </div>
        </div>
        <div class="plan-heatmap-row flex gap-3">
          <div
            class="plan-heatmap-label-col flex shrink-0 flex-col justify-around gap-[3px] py-0 text-[10px] font-medium leading-none text-[#6e7b75]"
            aria-hidden="true"
          >
            <span
              v-for="(rl, ri) in rowLabels"
              :key="rl"
              class="plan-heatmap-label-row flex items-center"
              >{{ ri % 2 === 0 ? rl : "" }}</span
            >
          </div>
          <div class="flex gap-[3px]">
            <div
              v-for="(col, ci) in columns"
              :key="`c-${ci}`"
              class="flex flex-col gap-[3px]"
            >
              <div
                v-for="(cell, ri) in col"
                :key="`${ci}-${ri}`"
                class="plan-heatmap-slot leading-none"
              >
                <ElTooltip
                  v-if="cell.date"
                  :content="tooltipText(cell)"
                  placement="top"
                  :show-after="200"
                  effect="light"
                >
                  <button
                    type="button"
                    :class="[
                      cellClass(cell),
                      isTodayCell(cell) ? 'plan-heatmap-cell--today' : '',
                    ]"
                    :aria-label="ariaLabel(cell)"
                    :data-date="cell.date"
                    :data-status="cell.status"
                    :data-today="isTodayCell(cell) ? 'true' : undefined"
                  />
                </ElTooltip>
                <div
                  v-else
                  :class="cellClass(cell)"
                  aria-hidden="true"
                />
              </div>
            </div>
          </div>
        </div>
        <div
          class="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5"
          role="list"
          aria-label="热力图颜色说明"
        >
          <span
            role="listitem"
            class="inline-flex items-center gap-1 rounded-full border border-stone-200/70 bg-white/90 px-2 py-0.5 text-[10px] font-semibold leading-none text-[#5c6a63] shadow-sm"
          >
            <span
              class="plan-heatmap-cell plan-heatmap-cell--none plan-heatmap-legend"
              aria-hidden="true"
            />
            无安排
          </span>
          <span
            role="listitem"
            class="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50/80 px-2 py-0.5 text-[10px] font-semibold leading-none text-emerald-900/90 shadow-sm"
          >
            <span
              class="plan-heatmap-cell plan-heatmap-cell--done plan-heatmap-legend"
              aria-hidden="true"
            />
            已满足
          </span>
          <span
            role="listitem"
            class="inline-flex items-center gap-1 rounded-full border border-rose-200/60 bg-rose-50/75 px-2 py-0.5 text-[10px] font-semibold leading-none text-rose-900/85 shadow-sm"
          >
            <span
              class="plan-heatmap-cell plan-heatmap-cell--missed plan-heatmap-legend"
              aria-hidden="true"
            />
            有遗漏
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 与格子同宽，保证「月标签行」与「数据列」竖线对齐 */
.plan-heatmap-month-cell {
  width: 11px;
}

@media (min-width: 640px) {
  .plan-heatmap-month-cell {
    width: 12px;
  }
}

/* 周标签列固定宽度（与中文「周三」等匹配），避免空行把列宽压窄导致每行首格参差不齐 */
.plan-heatmap-label-col {
  box-sizing: border-box;
  width: 2rem;
  padding-right: 0.125rem;
}

.plan-heatmap-label-row {
  height: 11px;
}

@media (min-width: 640px) {
  .plan-heatmap-label-col {
    width: 2.125rem;
  }

  .plan-heatmap-label-row {
    height: 12px;
  }
}

/* 每格固定占位：ElTooltip 触发器与占位 div 同盒，避免有日期/无日期两种节点宽度不一致 */
.plan-heatmap-slot {
  display: flex;
  width: 11px;
  height: 11px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}

@media (min-width: 640px) {
  .plan-heatmap-slot {
    width: 12px;
    height: 12px;
  }
}

.plan-heatmap-slot :deep(.el-tooltip__trigger) {
  display: flex !important;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  line-height: 0;
}

.plan-heatmap-cell {
  box-sizing: border-box;
  width: 11px;
  height: 11px;
  border-radius: 2px;
  flex-shrink: 0;
  border: none;
  padding: 0;
  margin: 0;
  cursor: default;
}

@media (min-width: 640px) {
  .plan-heatmap-cell {
    width: 12px;
    height: 12px;
    border-radius: 3px;
  }
}

.plan-heatmap-cell--out {
  visibility: hidden;
  pointer-events: none;
}

.plan-heatmap-cell--none {
  background: #ebedf0;
  box-shadow: inset 0 0 0 1px rgba(27, 31, 35, 0.06);
}

.plan-heatmap-cell--done {
  background: #2da44e;
  box-shadow: inset 0 0 0 1px rgba(25, 60, 35, 0.12);
}

.plan-heatmap-cell--missed {
  background: #cf222e;
  box-shadow: inset 0 0 0 1px rgba(80, 10, 15, 0.15);
}

/* 今天：外环 + 内描边，在各状态底色上均清晰 */
.plan-heatmap-cell--today.plan-heatmap-cell--none {
  box-shadow:
    inset 0 0 0 1px rgba(27, 31, 35, 0.06),
    0 0 0 1px rgba(255, 255, 255, 0.95),
    0 0 0 2px #0a8f4a;
}

.plan-heatmap-cell--today.plan-heatmap-cell--done {
  box-shadow:
    inset 0 0 0 1px rgba(25, 60, 35, 0.12),
    0 0 0 1px rgba(255, 255, 255, 0.95),
    0 0 0 2px #0a8f4a;
}

.plan-heatmap-cell--today.plan-heatmap-cell--missed {
  box-shadow:
    inset 0 0 0 1px rgba(80, 10, 15, 0.15),
    0 0 0 1px rgba(255, 255, 255, 0.95),
    0 0 0 2px #0a8f4a;
}

button.plan-heatmap-cell:focus-visible {
  outline: 2px solid #0a8f4a;
  outline-offset: 1px;
}

/* 图例色块略小于格子，单行标签内更紧凑 */
.plan-heatmap-cell.plan-heatmap-legend {
  display: inline-block;
  vertical-align: middle;
  width: 9px;
  height: 9px;
  border-radius: 2px;
}

@media (min-width: 640px) {
  .plan-heatmap-cell.plan-heatmap-legend {
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }
}
</style>
