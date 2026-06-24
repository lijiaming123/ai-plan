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
  effectiveDeadline,
  basicOptionalExpanded,
  basicOptionalFilledCount,
  startingPointOptions,
  travelCompanionOptions,
  travelBudgetOptions,
  travelStyleChipOptions,
  travelTransportChipOptions,
  normalizeCommaSeparatedTags,
  toggleCommaSeparatedTag,
  focusAreas,
  focusAreaInput,
  focusAreaHint,
  MAX_FOCUS_AREAS,
  removeFocusArea,
  handleFocusAreaKeydown,
  handleFocusAreaBlur,
  timeInvestmentOptions,
  granularityOptions,
  granularityHint,
  disableBeforeToday,
  disableBeforeStartDate,
} = props.ctx;
</script>

<template>
            <section
              class="create-surface create-surface--hero create-plan-unified-card rounded-2xl border border-[#e6ebe8] bg-white p-5 shadow-sm sm:p-6"
            >
              <div class="plan-create-card-border" aria-hidden="true"></div>
              <PlanCreateScenarioSection :ctx="props.ctx" variant="basic" />

              <h3 class="text-base font-bold text-[#26302b]">基础信息</h3>
              <p class="mb-4 mt-1 text-sm leading-relaxed text-[#5f6d66]">
                先完成标有 ✦ 的几项就能创建计划；其余随时可补，我们一步步来。
              </p>
              <div
                class="basic-form-grid grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-x-6 md:gap-y-5"
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
                  data-testid="plan-scenario-other-checkin-hint"
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
                        : '例如：30 天学会基础口语'
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
                    <span class="field-icon required">✦</span
                    >{{ isTravelScenario ? "自由补充（可选）" : "计划内容" }}
                  </p>
                  <textarea
                    v-model="form.requirement"
                    aria-label="计划内容"
                    class="form-control-textarea min-h-32 p-[15px] text-base leading-relaxed md:min-h-36"
                    :placeholder="
                      isTravelScenario
                        ? '可选：补充必去点/避雷、酒店区域偏好、忌口、每天最晚回酒店时间等'
                        : '写清楚你想达成什么、目前情况、以及你希望我们怎么拆解（越具体越好）'
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

                <label class="flex flex-col md:min-w-0">
                  <p class="field-label">
                    <span class="field-icon required">✦</span>计划开始时间
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

                <label
                  v-if="!isTravelScenario"
                  class="flex flex-col md:min-w-0"
                >
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
                  v-else
                  class="flex flex-col md:min-w-0"
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

                <div
                  class="deadline-hint flex flex-col justify-center rounded-xl border border-dashed border-[#d6e7dd] bg-[#f8fcfa] px-4 py-3 text-xs leading-5 text-[#5f6d66] md:min-h-[3.25rem]"
                >
                  预计完成时间：<span class="font-semibold text-[#1f2d27]">{{
                    effectiveDeadline || "待选择"
                  }}</span>
                </div>

                <div
                  class="optional-advanced-card rounded-2xl border border-[#dfe9e3] bg-[#fbfcfb] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] md:col-span-2"
                >
                  <button
                    type="button"
                    data-testid="basic-optional-toggle"
                    class="optional-advanced-toggle"
                    :aria-expanded="basicOptionalExpanded"
                    aria-controls="basic-optional-panel"
                    @click="basicOptionalExpanded = !basicOptionalExpanded"
                  >
                    <span
                      class="flex min-w-0 flex-1 flex-col items-start gap-1 text-left sm:flex-row sm:items-center sm:gap-3"
                    >
                      <span class="optional-advanced-title">更多选项</span>
                      <span class="optional-advanced-subtitle"
                        >选填 · 起点、时间投入、颗粒度等</span
                      >
                      <span
                        v-if="
                          basicOptionalFilledCount > 0 && !basicOptionalExpanded
                        "
                        class="optional-advanced-badge"
                      >
                        已填 {{ basicOptionalFilledCount }} 项
                      </span>
                    </span>
                    <span
                      class="optional-advanced-chevron"
                      :class="{ 'is-open': basicOptionalExpanded }"
                      aria-hidden="true"
                      >▼</span
                    >
                  </button>
                  <div
                    id="basic-optional-panel"
                    v-show="basicOptionalExpanded"
                    class="optional-advanced-body flex flex-col gap-5 px-3 pb-4 pt-1 sm:px-4"
                  >
                    <label class="flex flex-col">
                      <p class="field-label">
                        <span class="field-icon optional">◌</span>起点状态
                      </p>
                      <div
                        data-testid="field-starting-point"
                        class="ui-sunrise-select-shell w-full"
                      >
                        <UiSunriseSelect
                          v-model="form.startingPoint"
                          aria-label="起点状态"
                          size="large"
                          :placeholder="
                            form.planScenario
                              ? '可选：描述你现在的基础'
                              : '请先选择计划场景'
                          "
                          :disabled="!form.planScenario"
                        >
                          <ElOption label="不设置" value="" />
                          <ElOption
                            v-for="option in startingPointOptions"
                            :key="option.value"
                            :label="option.label"
                            :value="option.value"
                          />
                        </UiSunriseSelect>
                      </div>
                    </label>

                    <div
                      v-if="isTravelScenario"
                      class="grid grid-cols-1 gap-5 md:grid-cols-2"
                    >
                      <label class="flex flex-col">
                        <p class="field-label">
                          <span class="field-icon optional">◌</span>同行人
                        </p>
                        <div class="ui-sunrise-select-shell w-full">
                          <UiSunriseSelect
                            v-model="form.travelCompanions"
                            aria-label="同行人"
                            size="large"
                            placeholder="可选：选择同行人类型"
                          >
                            <ElOption
                              v-for="opt in travelCompanionOptions"
                              :key="opt.value"
                              :label="opt.label"
                              :value="opt.value"
                            />
                          </UiSunriseSelect>
                        </div>
                      </label>

                      <label class="flex flex-col">
                        <p class="field-label">
                          <span class="field-icon optional">◌</span>预算
                        </p>
                        <div class="ui-sunrise-select-shell w-full">
                          <UiSunriseSelect
                            v-model="form.travelBudget"
                            aria-label="预算"
                            size="large"
                            placeholder="可选：选择预算档位"
                          >
                            <ElOption
                              v-for="opt in travelBudgetOptions"
                              :key="opt.value"
                              :label="opt.label"
                              :value="opt.value"
                            />
                          </UiSunriseSelect>
                        </div>
                      </label>

                      <label class="flex flex-col md:col-span-2">
                        <p class="field-label">
                          <span class="field-icon optional">◌</span>旅行风格
                        </p>
                        <div class="flex flex-wrap gap-2">
                          <button
                            v-for="tag in travelStyleChipOptions"
                            :key="tag"
                            type="button"
                            class="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
                            :class="
                              normalizeCommaSeparatedTags(form.travelStyles).includes(tag)
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            "
                            @click="
                              form.travelStyles = toggleCommaSeparatedTag({
                                current: form.travelStyles,
                                tag,
                              })
                            "
                          >
                            {{ tag }}
                          </button>
                        </div>
                        <input
                          v-model="form.travelStyles"
                          aria-label="旅行风格"
                          class="mt-2 form-control-input h-12 p-[15px] text-base"
                          placeholder="可选：也可以手动输入（用逗号/顿号分隔）"
                        />
                      </label>

                      <label class="flex flex-col md:col-span-2">
                        <p class="field-label">
                          <span class="field-icon optional">◌</span>交通偏好
                        </p>
                        <div class="flex flex-wrap gap-2">
                          <button
                            v-for="tag in travelTransportChipOptions"
                            :key="tag"
                            type="button"
                            class="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
                            :class="
                              normalizeCommaSeparatedTags(form.travelTransport).includes(tag)
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            "
                            @click="
                              form.travelTransport = toggleCommaSeparatedTag({
                                current: form.travelTransport,
                                tag,
                              })
                            "
                          </button>
                        </div>
                        <input
                          v-model="form.travelTransport"
                          aria-label="交通偏好"
                          class="mt-2 form-control-input h-12 p-[15px] text-base"
                          placeholder="可选：也可以手动输入（用逗号/顿号分隔）"
                        />
                      </label>

                      <label class="flex flex-col md:col-span-2">
                        <p class="field-label">
                          <span class="field-icon optional">◌</span>约束与偏好
                        </p>
                        <textarea
                          v-model="form.travelConstraints"
                          class="form-control-textarea min-h-24 p-[15px] text-base leading-relaxed"
                          placeholder="可选：忌口、必去、避雷、住宿区域、每日最晚回酒店时间等"
                        />
                      </label>
                    </div>

                    <label class="flex flex-col">
                      <p class="field-label">
                        <span class="field-icon optional">◌</span>偏好与约束
                      </p>
                      <textarea
                        v-model="form.preference"
                        class="form-control-textarea min-h-24 p-[15px] text-base leading-relaxed"
                        placeholder="例如：工作日晚上可投入，周三不安排高强度任务"
                      />
                    </label>

                    <label class="flex flex-col">
                      <p class="field-label">
                        <span class="field-icon optional">◌</span>重点倾斜 /
                        薄弱项
                      </p>
                      <div class="form-control-tagbox p-3">
                        <div
                          v-if="focusAreas.length"
                          class="mb-2 flex flex-wrap gap-2"
                        >
                          <span
                            v-for="(item, index) in focusAreas"
                            :key="`${item}-${index}`"
                            class="inline-flex items-center gap-1 rounded-full bg-[#ecf8f0] px-2.5 py-1 text-xs font-semibold text-[#1c5e3f]"
                          >
                            {{ item }}
                            <button
                              type="button"
                              class="rounded-full px-1 text-[#2b7a53] transition hover:bg-[#dff0e7]"
                              :aria-label="`删除重点项-${item}`"
                              @click="removeFocusArea(index)"
                            >
                              ×
                            </button>
                          </span>
                        </div>
                        <input
                          v-model="focusAreaInput"
                          aria-label="添加重点倾斜"
                          class="h-9 w-full border-none bg-transparent text-sm outline-none"
                          placeholder="输入后按 Enter 或逗号添加，例如：数学"
                          :disabled="focusAreas.length >= MAX_FOCUS_AREAS"
                          @keydown="handleFocusAreaKeydown"
                          @blur="handleFocusAreaBlur"
                        />
                        <p class="mt-1 text-xs text-[#6f7e76]">
                          {{ focusAreas.length }}/{{ MAX_FOCUS_AREAS }}
                        </p>
                        <p
                          v-if="focusAreas.length >= MAX_FOCUS_AREAS"
                          class="mt-1 text-xs font-semibold text-[#cc4338]"
                        >
                          最多添加{{ MAX_FOCUS_AREAS }}个重点项
                        </p>
                        <p
                          v-if="focusAreaHint"
                          class="mt-1 text-xs font-semibold text-[#cc4338]"
                        >
                          {{ focusAreaHint }}
                        </p>
                      </div>
                    </label>

                    <label class="flex flex-col">
                      <p class="field-label">
                        <span class="field-icon optional">◌</span>投入时间
                      </p>
                      <div
                        data-testid="field-time-investment"
                        class="ui-sunrise-select-shell w-full"
                      >
                        <UiSunriseSelect
                          v-model="form.timeInvestment"
                          aria-label="投入时间"
                          size="large"
                        >
                          <ElOption
                            v-for="option in timeInvestmentOptions"
                            :key="option.value"
                            :label="option.label"
                            :value="option.value"
                          />
                        </UiSunriseSelect>
                      </div>
                      <input
                        v-if="form.timeInvestment === 'custom'"
                        v-model="form.timeInvestmentCustomHours"
                        aria-label="自定义每周投入小时"
                        type="number"
                        min="1"
                        step="1"
                        class="form-control-number mt-3 h-12 p-[15px] text-base"
                        placeholder="请输入每周投入小时（例如 12）"
                      />
                      <p
                        v-if="errors.timeInvestmentCustomHours"
                        class="mt-2 text-xs font-semibold text-[#cc4338]"
                      >
                        {{ errors.timeInvestmentCustomHours }}
                      </p>
                    </label>

                    <label class="flex flex-col">
                      <p class="field-label">
                        <span class="field-icon optional">◌</span>计划颗粒度
                      </p>
                      <div
                        data-testid="field-granularity"
                        class="ui-sunrise-select-shell w-full"
                      >
                        <UiSunriseSelect
                          v-model="form.granularityMode"
                          aria-label="计划颗粒度"
                          size="large"
                        >
                          <ElOption
                            v-for="option in granularityOptions"
                            :key="option.value"
                            :label="option.label"
                            :value="option.value"
                          />
                        </UiSunriseSelect>
                      </div>
                      <p
                        v-if="granularityHint"
                        class="mt-2 text-xs text-[#5f6d66]"
                      >
                        {{ granularityHint }}
                      </p>
                    </label>
                  </div>
                </div>
              </div>
            </section>
</template>
