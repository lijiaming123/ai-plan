<script setup lang="ts">
import type { PlanCreateContext } from "../composables/plan-create-context";
import { authState } from "../../../../stores/auth";

const props = defineProps<{
  ctx: PlanCreateContext;
  variant: "basic" | "pro";
}>();
const { isProMode, switchTierMode, showUpgradeHint } = props.ctx;
</script>

<template>
  <div v-if="variant === 'basic'">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div
                  class="tier-tab-rail inline-flex rounded-full bg-[#e8f0ec] p-1 ring-1 ring-[#0f8b4e]/15"
                  role="tablist"
                  aria-label="创建计划版本"
                >
                  <button
                    data-testid="tier-tab-basic"
                    type="button"
                    role="tab"
                    class="rounded-full px-4 py-1.5 text-xs font-semibold transition duration-200"
                    :class="
                      !isProMode
                        ? 'tier-tab-active bg-white text-[#1f2a24]'
                        : 'text-[#6a7771] hover:text-[#33433b]'
                    "
                    @click="switchTierMode('basic')"
                  >
                    普通版
                  </button>
                  <button
                    data-testid="tier-tab-pro"
                    type="button"
                    role="tab"
                    class="rounded-full px-4 py-1.5 text-xs font-semibold transition duration-200"
                    :class="
                      isProMode
                        ? 'tier-tab-active bg-white text-[#1f2a24]'
                        : 'text-[#6a7771] hover:text-[#33433b]'
                    "
                    @click="switchTierMode('pro')"
                  >
                    专业版
                  </button>
                </div>
              </div>
              <p class="mt-3 text-sm leading-relaxed text-[#64716b]">
                当前为{{
                  isProMode ? "专业版创建计划" : "普通版创建计划"
                }}。先把目标写下来就很棒了——不必一次写完美，我们可以边做边完善。
              </p>
              <div
                class="mt-3 flex flex-wrap items-center gap-4 text-xs text-[#64716b]"
              >
                <span class="inline-flex items-center gap-1.5"
                  ><span class="field-icon required field-icon-pulse">✦</span
                  >必填</span
                >
                <span class="inline-flex items-center gap-1.5"
                  ><span class="field-icon optional">◌</span>非必填</span
                >
              </div>
              <div
                v-if="showUpgradeHint && authState.tier === 'basic'"
                data-testid="upgrade-hint"
                class="mt-3 rounded-lg border border-primary/35 bg-primary/10 px-3 py-2 text-xs font-semibold text-[#0b8d4a]"
              >
                当前为普通版，升级后可启用高级拆解与智能提醒策略。
              </div>

              <div class="my-5 border-t border-[#e8eeea]"></div>
  </div>
  <div v-else>
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div
                    class="tier-tab-rail inline-flex rounded-full bg-[#e8f0ec] p-1 ring-1 ring-[#0f8b4e]/15"
                    role="tablist"
                    aria-label="创建计划版本"
                  >
                    <button
                      data-testid="tier-tab-basic"
                      type="button"
                      role="tab"
                      class="rounded-full px-4 py-1.5 text-xs font-semibold transition duration-200"
                      :class="
                        !isProMode
                          ? 'tier-tab-active bg-white text-[#1f2a24]'
                          : 'text-[#6a7771] hover:text-[#33433b]'
                      "
                      @click="switchTierMode('basic')"
                    >
                      普通版
                    </button>
                    <button
                      data-testid="tier-tab-pro"
                      type="button"
                      role="tab"
                      class="rounded-full px-4 py-1.5 text-xs font-semibold transition duration-200"
                      :class="
                        isProMode
                          ? 'tier-tab-active bg-white text-[#1f2a24]'
                          : 'text-[#6a7771] hover:text-[#33433b]'
                      "
                      @click="switchTierMode('pro')"
                    >
                      专业版
                    </button>
                  </div>
                </div>
                <p class="mt-3 text-sm leading-relaxed text-[#64716b]">
                  当前为专业版创建计划。先填好基础信息，然后用「计划助手」生成初稿，我们再一起微调。
                </p>
                <div
                  class="mt-3 flex flex-wrap items-center gap-4 text-xs text-[#64716b]"
                >
                  <span class="inline-flex items-center gap-1.5"
                    ><span class="field-icon required">✦</span>必填</span
                  >
                  <span class="inline-flex items-center gap-1.5"
                    ><span class="field-icon optional">◌</span>非必填</span
                  >
                </div>
                <div class="my-5 border-t border-[#e8eeea]"></div>
  </div>
</template>
