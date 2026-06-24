<script setup lang="ts">
import type { PlanCreateContext } from "../composables/plan-create-context";
import UiSunriseSelect from "../../../../components/UiSunriseSelect.vue";
import PlanCreateScenarioSection from "./PlanCreateScenarioSection.vue";

const props = defineProps<{ ctx: PlanCreateContext }>();
const {
  form,
  errors,
  scenarioOptions,
  isOtherScenario,
  isTravelScenario,
  cycleOptions,
  handlePlanFileChange,
  uploadedPlanFileName,
  uploadedFileHint,
  disableBeforeToday,
  disableBeforeStartDate,
} = props.ctx;
</script>

<template>
              <div
                class="create-surface create-surface--hero create-plan-unified-card rounded-2xl border border-[#e6ebe8] bg-white p-5 shadow-sm sm:p-6"
              >
                <PlanCreateScenarioSection :ctx="props.ctx" variant="pro" />
                <h3 class="text-base font-bold text-[#26302b]">
                  专业版基础信息
                </h3>
                <p class="mb-4 mt-1 text-sm text-[#5f6d66]">
                  双列便于一眼核对时间与周期；计划内容仍建议写全。
                </p>
                <div
                  class="pro-basic-form-grid grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-x-6 md:gap-y-5"
                >
                  <label class="flex min-w-0 flex-col">
                    <p class="field-label">
                      <span class="field-icon required">✦</span>计划场景
                    </p>
                    <div
                      data-testid="field-plan-scenario"
                      class="ui-sunrise-select-shell w-full"
                    >
                      <UiSunriseSelect
                        v-model="form.planScenario"
                        aria-label="计划场景"
                        size="large"
                        placeholder="选择一个最贴近的场景"
                      >
                        <ElOption
                          v-for="option in scenarioOptions"
                          :key="option.value"
                          :label="option.label"
                          :value="option.value"
                        />
                      </UiSunriseSelect>
                    </div>
                    <p
                      v-if="errors.planScenario"
                      class="mt-2 text-xs font-semibold text-[#cc4338]"
                    >
                      {{ errors.planScenario }}
                    </p>
                  </label>

                  <p
                    v-if="isOtherScenario"
                    class="text-xs leading-relaxed text-[#5f6d66] md:col-span-2"
                    data-testid="plan-scenario-other-checkin-hint-pro"
                  >
                    「其它」计划定稿后按天<strong class="font-semibold text-[#4d7a63]">勾选完成</strong>即可打卡，可在每个打卡段写一句文字备注；<strong class="font-semibold">不需要</strong>上传附件作为打卡材料。
                  </p>

                  <label class="flex min-w-0 flex-col">
                    <p class="field-label">
                      <span class="field-icon required">✦</span>计划名称
                    </p>
                    <input
                      v-model="form.goal"
                      aria-label="计划名称"
                      class="form-control-input h-14 p-[15px] text-base"
                      :placeholder="
                        isTravelScenario
                          ? '例如：日本关西 6 天游（城市漫游）'
                          : '例如：90 天英语口语冲刺'
                      "
                    />
                    <p
                      v-if="errors.goal"
                      class="mt-2 text-xs font-semibold text-[#cc4338]"
                    >
                      {{ errors.goal }}
                    </p>
                  </label>

                  <label class="flex flex-col md:col-span-2">
                    <p class="field-label">
                      <span class="field-icon optional">◌</span>上传计划文件
                    </p>
                    <input
                      type="file"
                      aria-label="计划文件上传"
                      accept=".txt,.md,.markdown,.doc,.docx"
                      class="form-control-file h-11 px-3 py-2 text-sm text-[#33433b]"
                      @change="handlePlanFileChange"
                    />
                    <p
                      v-if="uploadedPlanFileName"
                      class="mt-2 text-xs text-[#0f8b4e]"
                    >
                      已选择：{{ uploadedPlanFileName }}
                    </p>
                    <p
                      v-if="uploadedFileHint"
                      class="mt-1 text-xs text-[#64716b]"
                    >
                      {{ uploadedFileHint }}
                    </p>
                  </label>

                  <label class="flex flex-col md:col-span-2">
                    <p class="field-label">
                      <span class="field-icon required">✦</span>计划内容
                    </p>
                    <textarea
                      v-model="form.requirement"
                      aria-label="计划内容"
                      class="form-control-textarea min-h-32 p-[15px] text-base leading-relaxed md:min-h-36"
                      :placeholder="
                        isTravelScenario
                          ? '可选：补充必去点/避雷、酒店区域偏好、忌口、每天最晚回酒店时间等'
                          : '写清楚目标、目前情况、时间限制，以及你希望我重点帮你拆解的部分'
                      "
                    />
                    <p
                      v-if="errors.requirement"
                      class="mt-2 text-xs font-semibold text-[#cc4338]"
                    >
                      {{ errors.requirement }}
                    </p>
                  </label>

                  <label
                    v-if="isTravelScenario"
                    class="flex min-w-0 flex-col"
                    data-testid="field-travel-from"
                  >
                    <p class="field-label">
                      <span class="field-icon required">✦</span>出发地
                    </p>
                    <input
                      v-model="form.travelFrom"
                      aria-label="出发地"
                      class="form-control-input h-14 p-[15px] text-base"
                      placeholder="例如：上海"
                    />
                    <p
                      v-if="errors.travelFrom"
                      class="mt-2 text-xs font-semibold text-[#cc4338]"
                    >
                      {{ errors.travelFrom }}
                    </p>
                  </label>

                  <label
                    v-if="isTravelScenario"
                    class="flex min-w-0 flex-col"
                    data-testid="field-travel-to"
                  >
                    <p class="field-label">
                      <span class="field-icon required">✦</span>目的地
                    </p>
                    <input
                      v-model="form.travelTo"
                      aria-label="目的地"
                      class="form-control-input h-14 p-[15px] text-base"
                      placeholder="例如：大阪、京都（可用顿号/逗号分隔）"
                    />
                    <p
                      v-if="errors.travelTo"
                      class="mt-2 text-xs font-semibold text-[#cc4338]"
                    >
                      {{ errors.travelTo }}
                    </p>
                  </label>

                  <label class="flex min-w-0 flex-col">
                    <p class="field-label">
                      <span class="field-icon required">✦</span>开始时间
                    </p>
                    <div class="plan-date-shell w-full">
                      <ElDatePicker
                        v-model="form.startDate"
                        type="date"
                        value-format="YYYY-MM-DD"
                        format="YYYY-MM-DD"
                        class="plan-create-date-picker w-full"
                        :disabled-date="disableBeforeToday"
                        placeholder="选择开始日期"
                      />
                    </div>
                    <p
                      v-if="errors.startDate"
                      class="mt-2 text-xs font-semibold text-[#cc4338]"
                    >
                      {{ errors.startDate }}
                    </p>
                  </label>

                  <label v-if="!isTravelScenario" class="flex min-w-0 flex-col">
                    <p class="field-label">
                      <span class="field-icon required">✦</span>计划周期
                    </p>
                    <div
                      data-testid="field-cycle"
                      class="ui-sunrise-select-shell w-full"
                    >
                      <UiSunriseSelect
                        v-model="form.cycle"
                        aria-label="计划周期"
                        size="large"
                      >
                        <ElOption
                          v-for="option in cycleOptions"
                          :key="option.value"
                          :label="option.label"
                          :value="option.value"
                        />
                      </UiSunriseSelect>
                    </div>
                  </label>

                  <label
                    v-if="!isTravelScenario && form.cycle === 'custom'"
                    class="flex flex-col md:col-span-2"
                    data-testid="custom-end-date"
                  >
                    <p class="field-label">
                      <span class="field-icon required">✦</span>计划完成时间
                    </p>
                    <div class="plan-date-shell w-full">
                      <ElDatePicker
                        v-model="form.customEndDate"
                        type="date"
                        value-format="YYYY-MM-DD"
                        format="YYYY-MM-DD"
                        class="plan-create-date-picker w-full"
                        :disabled-date="disableBeforeStartDate"
                        placeholder="选择完成日期"
                      />
                    </div>
                    <p
                      v-if="errors.customEndDate"
                      class="mt-2 text-xs font-semibold text-[#cc4338]"
                    >
                      {{ errors.customEndDate }}
                    </p>
                  </label>

                  <label
                    v-else-if="isTravelScenario"
                    class="flex flex-col md:col-span-2"
                    data-testid="field-travel-end-date"
                  >
                    <p class="field-label">
                      <span class="field-icon required">✦</span>结束日期
                    </p>
                    <div class="plan-date-shell w-full">
                      <ElDatePicker
                        v-model="form.travelEndDate"
                        type="date"
                        value-format="YYYY-MM-DD"
                        format="YYYY-MM-DD"
                        class="plan-create-date-picker w-full"
                        :disabled-date="disableBeforeStartDate"
                        placeholder="选择结束日期"
                      />
                    </div>
                    <p
                      v-if="errors.travelEndDate"
                      class="mt-2 text-xs font-semibold text-[#cc4338]"
                    >
                      {{ errors.travelEndDate }}
                    </p>
                  </label>
                </div>
              </div>
</template>
