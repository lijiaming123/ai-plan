<script setup lang="ts">
import type { PlanCreateContext } from "../composables/plan-create-context";
import { renderMarkdownToHtml } from "../../../../lib/render-markdown";
import { authState } from "../../../../stores/auth";

const props = defineProps<{ ctx: PlanCreateContext }>();
const {
  isAiThinking,
  handleGenerateAiDraft,
  isProMode,
  proDraftGenerated,
  proOptimizationConfirmed,
  proMeta,
  proSelectedOptionId,
  proCustomOptimization,
  proApplyLoading,
  confirmProOptimizationDefault,
  selectProOptimizationOption,
  applyProOptionOrCustom,
  planAssistantChatWindowRef,
  chatMessages,
  assistantDraftStreamMessageId,
  chatInput,
  handleChatInputKeydown,
  handleChatSend,
} = props.ctx;
</script>

<template>
              <div
                class="rounded-2xl border border-[#dce8e1] bg-white p-4 shadow-sm"
              >
                <div class="mb-3 flex items-center justify-between">
                  <h3 class="text-base font-bold text-[#26302b]">计划助手</h3>
                  <button
                    type="button"
                    data-testid="ai-generate-draft"
                    class="rounded-lg border border-[#cfe4d8] bg-[#f3faf6] px-3 py-1.5 text-xs font-semibold text-[#0f8b4e] transition hover:bg-[#e9f6ef]"
                    :disabled="isAiThinking"
                    @click="handleGenerateAiDraft"
                  >
                    {{ isAiThinking ? "正在生成…" : "生成一版初稿" }}
                  </button>
                </div>

                <div
                  v-if="
                    isProMode && authState.tier === 'pro' && proDraftGenerated
                  "
                  class="pro-agent-review mb-3 rounded-2xl border border-emerald-100/70 bg-gradient-to-b from-emerald-50/40 to-white/70 p-3 shadow-[0_12px_34px_-22px_rgba(12,80,48,0.28)]"
                  data-testid="pro-agent-review"
                >
                  <div
                    class="flex flex-wrap items-center justify-between gap-2"
                  >
                    <div class="flex items-center gap-2">
                      <span
                        class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/90 text-emerald-700 shadow-sm ring-1 ring-emerald-100/80"
                      >
                        <span class="material-symbols-outlined text-[20px]"
                          >verified</span
                        >
                      </span>
                      <div>
                        <p
                          class="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-800/55"
                        >
                          Pro 评审
                        </p>
                        <p class="text-sm font-semibold text-[#0f2918]">
                          {{
                            proOptimizationConfirmed
                              ? "已确认优化版本"
                              : "等待你确认优化版本"
                          }}
                        </p>
                      </div>
                    </div>
                    <span
                      v-if="proMeta?.score != null"
                      class="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 text-[12px] font-black text-[#0a8f4a] ring-1 ring-emerald-100/80"
                    >
                      评分 {{ proMeta.score }}
                    </span>
                  </div>

                  <div v-if="!proOptimizationConfirmed" class="mt-3 grid gap-2">
                    <button
                      type="button"
                      data-testid="pro-confirm-default"
                      class="h-10 rounded-xl bg-[#0a8f4a] px-4 text-sm font-bold text-white shadow-[0_10px_26px_-16px_rgba(12,80,48,0.55)] transition hover:brightness-105 active:scale-[0.99]"
                      @click="confirmProOptimizationDefault"
                    >
                      就用这个版本
                    </button>

                    <div
                      v-if="proMeta?.options?.length"
                      class="rounded-xl border border-emerald-100/70 bg-white/70 p-3"
                    >
                      <p class="text-xs font-semibold text-[#305446]">
                        也可以选一个优化方向
                      </p>
                      <div class="mt-2 flex flex-wrap gap-2">
                        <button
                          v-for="opt in proMeta.options"
                          :key="opt.id"
                          type="button"
                          class="rounded-full border px-3 py-1 text-[12px] font-semibold transition"
                          :class="
                            proSelectedOptionId === opt.id
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                              : 'border-stone-200/70 bg-white/70 text-stone-600 hover:border-emerald-200 hover:text-emerald-800'
                          "
                          @click="selectProOptimizationOption(opt.id)"
                        >
                          {{ opt.title }}
                        </button>
                      </div>
                      <div
                        class="mt-3 rounded-xl border border-stone-200/70 bg-stone-50/60 p-2"
                      >
                        <textarea
                          v-model="proCustomOptimization"
                          rows="2"
                          class="w-full resize-none border-none bg-transparent px-2 py-1 text-[12px] leading-relaxed text-stone-700 outline-none"
                          placeholder="也可以补一句你想怎么优化（可选），例如「把每周目标拆得更具体，包含证据」"
                        />
                        <div class="flex justify-end">
                          <button
                            type="button"
                            data-testid="pro-apply-option"
                            class="mt-1 h-9 rounded-lg bg-white px-3 text-[12px] font-bold text-[#0f8b4e] ring-1 ring-emerald-200/60 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                            :disabled="
                              proApplyLoading ||
                              (!proSelectedOptionId &&
                                !proCustomOptimization.trim())
                            "
                            @click="applyProOptionOrCustom"
                          >
                            {{ proApplyLoading ? "正在应用…" : "应用并确认版本" }}
                          </button>
                        </div>
                      </div>
                      <p class="mt-2 text-[11px] text-stone-500">
                        提示：确认版本后，就可以点击底部「立即生成计划」。
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  ref="planAssistantChatWindowRef"
                  class="pro-chat-window ui-scrollbar mb-3"
                >
                  <div
                    v-for="message in chatMessages"
                    :key="message.id"
                    class="pro-chat-message"
                    :class="[
                      message.role === 'assistant' ? 'is-assistant' : 'is-user',
                      message.id === assistantDraftStreamMessageId
                        ? 'is-draft-streaming'
                        : '',
                    ]"
                  >
                    <p class="pro-chat-role">
                      {{ message.role === "assistant" ? "助手" : "你" }}
                    </p>
                    <div
                      class="pro-chat-content plan-assistant-markdown"
                      :data-testid="
                        message.id === assistantDraftStreamMessageId
                          ? 'assistant-draft-stream-content'
                          : undefined
                      "
                      v-html="renderMarkdownToHtml(message.content)"
                    />
                  </div>
                  <div v-if="isAiThinking" class="pro-chat-thinking">
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="ml-1">正在整理回复…</span>
                  </div>
                </div>

                <div
                  class="rounded-xl border border-[#dbe6df] bg-[#fbfdfc] p-2"
                >
                  <textarea
                    v-model="chatInput"
                    rows="3"
                    aria-label="对话完善计划"
                    class="w-full resize-none border-none bg-transparent px-2 py-1 text-sm outline-none"
                    placeholder="例如：帮我按周拆目标，并加上每周复盘任务。"
                    @keydown="handleChatInputKeydown"
                  />
                  <div class="flex justify-end">
                    <button
                      type="button"
                      class="rounded-md bg-[#0f8b4e] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                      :disabled="isAiThinking || !chatInput.trim()"
                      @click="handleChatSend"
                    >
                      发送
                    </button>
                  </div>
                </div>
              </div>
</template>
