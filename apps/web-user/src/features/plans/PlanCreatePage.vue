<script setup lang="ts">
import UiErrorToast from "../../components/UiErrorToast.vue";
import { usePlanCreate } from "./create/composables/usePlanCreate";
import PlanCreatePresetCards from "./create/components/PlanCreatePresetCards.vue";
import PlanCreateBasicForm from "./create/components/PlanCreateBasicForm.vue";
import PlanCreateProPanel from "./create/components/PlanCreateProPanel.vue";
import PlanCreateAssistantChat from "./create/components/PlanCreateAssistantChat.vue";

const ctx = usePlanCreate();
const {
  errorToastMessage,
  closeErrorToast,
  aiQuotaSummaryText,
  planAssistantMemoryLoaded,
  planAssistantMemoryDismissed,
  goBack,
  handleSubmit,
  isSubmitting,
  isProMode,
} = ctx;
</script>

<template>
  <div
    class="plan-create-view relative flex h-[100dvh] flex-col overflow-hidden font-display text-[#111813]"
  >
    <UiErrorToast :message="errorToastMessage" @close="closeErrorToast" />

    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="bg-grid absolute inset-0"></div>
      <div class="bg-orb bg-orb-left"></div>
      <div class="bg-orb bg-orb-right"></div>
      <div class="bg-orb bg-orb-bottom"></div>
      <div class="plan-create-grain" aria-hidden="true"></div>
    </div>

    <header
      class="plan-create-sticky-bar relative z-50 shrink-0 border-b border-[#dbe8e1]/90"
    >
      <div class="plan-create-header-sheen" aria-hidden="true"></div>
      <div
        class="relative flex w-full items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8 sm:py-3"
      >
        <div class="relative z-10 flex min-w-0 items-center gap-2 sm:gap-3">
          <div class="size-5 shrink-0 sm:size-6">
            <svg
              fill="none"
              viewBox="0 0 48 48"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M6 6H42L36 24L42 42H6L12 24L6 6Z" fill="currentColor" />
            </svg>
          </div>
          <h2
            class="truncate text-sm font-bold tracking-[-0.015em] text-[#1f2a24] sm:text-base"
          >
            计划大师
          </h2>
        </div>
        <h1
          class="create-page-title pointer-events-none absolute left-1/2 top-1/2 z-0 max-w-[min(52vw,14rem)] -translate-x-1/2 -translate-y-1/2 truncate text-center text-sm font-black leading-[1.1] tracking-[-0.04em] text-[#111813] sm:max-w-none sm:px-2 sm:text-base md:text-xl md:tracking-[-0.05em] lg:text-2xl"
        >
          创建新计划
        </h1>
        <div class="relative z-10 flex min-w-0 justify-end">
          <router-link
            to="/plans"
            class="shrink-0 text-xs font-semibold text-[#2d3b34] transition hover:text-[#0f8b4e] sm:text-sm"
          >
            我的计划
          </router-link>
        </div>
      </div>
    </header>

    <div
      v-if="aiQuotaSummaryText"
      class="relative z-40 border-b border-amber-200/70 bg-amber-50/90 px-3 py-1.5 text-center text-[11px] font-medium text-amber-950 sm:text-xs"
      data-testid="ai-quota-banner"
    >
      <span>{{ aiQuotaSummaryText }}</span>
      <router-link
        to="/settings?focus=pro"
        class="ml-1.5 font-bold text-[#0f8b4e] underline underline-offset-2"
        >会员与额度</router-link
      >
    </div>

    <div
      v-if="planAssistantMemoryLoaded && !planAssistantMemoryDismissed"
      class="relative z-40 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-emerald-200/75 bg-emerald-50/90 px-3 py-1.5 text-center text-[11px] font-medium text-emerald-950 sm:text-xs"
      data-testid="plan-assistant-memory-banner"
    >
      <span>已加载你在「设置」中的计划助手偏好；生成时服务端会注入近期执行摘要（不含历史正文全文）。</span>
      <router-link
        to="/settings"
        class="font-bold text-[#0f8b4e] underline underline-offset-2"
        >去设置</router-link
      >
      <button
        type="button"
        class="rounded-md px-1.5 py-0.5 text-[11px] font-bold text-emerald-800/90 underline decoration-emerald-400/80 underline-offset-2 hover:bg-emerald-100/60"
        data-testid="plan-assistant-memory-dismiss"
        @click="planAssistantMemoryDismissed = true"
      >
        关闭
      </button>
    </div>

    <div
      class="plan-create-scroll ui-scrollbar relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
    >
      <main class="plan-create-main px-4 pb-8 pt-4 sm:px-6 sm:pt-5 lg:px-8">
        <div class="mx-auto flex w-full max-w-5xl items-start gap-3 sm:gap-4">
          <button
            type="button"
            class="back-nav-btn shrink-0 self-start"
            aria-label="返回上一页"
            @click="goBack"
          >
            <span class="back-nav-icon" aria-hidden="true">←</span>
            <span class="back-nav-text">返回上一页</span>
          </button>

          <form
            id="plan-create-form"
            class="flex min-w-0 flex-1 flex-col gap-6"
            @submit.prevent="handleSubmit"
          >
            <PlanCreatePresetCards :ctx="ctx" />

            <PlanCreateBasicForm v-if="!isProMode" :ctx="ctx" />

            <section
              v-else
              class="space-y-6"
              data-testid="pro-capability-panel"
            >
              <PlanCreateProPanel :ctx="ctx" />
              <PlanCreateAssistantChat :ctx="ctx" />
            </section>
          </form>
        </div>
      </main>
    </div>

    <div
      class="create-action-dock shrink-0"
      data-testid="create-plan-action-dock"
    >
      <div
        class="create-action-dock__inner mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-6"
      >
        <p
          class="create-action-dock__hint text-center text-[11px] leading-snug text-[#6f7e76] sm:max-w-[min(24rem,38vw)] sm:text-left sm:text-xs sm:leading-relaxed sm:text-[#5f6d66]"
        >
          填好必填项即可生成；选填在「更多选项」里随时展开。
        </p>
        <router-link
          to="/plans"
          class="create-action-dock__secondary flex h-11 min-h-[44px] flex-1 items-center justify-center rounded-xl px-5 text-sm font-bold text-[#33433b] transition hover:bg-black/[0.04] sm:flex-initial sm:px-6"
        >
          取消
        </router-link>
        <button
          class="create-action-dock__submit flex h-11 min-h-[44px] min-w-[9.5rem] flex-[1.15] items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-[#111813] shadow-[0_6px_20px_-6px_rgba(18,74,49,0.35)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-initial sm:px-8"
          type="submit"
          form="plan-create-form"
          :disabled="isSubmitting"
        >
          {{ isSubmitting ? "生成中…" : "立即生成计划" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./create/plan-create-page.styles.css"></style>
