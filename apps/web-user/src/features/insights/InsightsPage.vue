<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import PageSectionHeading from "../../components/PageSectionHeading.vue";
import UiErrorToast from "../../components/UiErrorToast.vue";
import { getApiClient, type UserInsightsResponse } from "../../lib/api-client";
import { authState } from "../../stores/auth";

const loading = ref(true);
const errorToastMessage = ref("");
const insights = ref<UserInsightsResponse | null>(null);

const kpiCards = computed(() => {
  const i = insights.value;
  const dash = i == null;
  return [
    {
      id: "active",
      label: "进行中计划",
      value: dash ? "—" : String(i.activePlans),
      hint: "已定稿且未删除、未归档的计划数",
      icon: "folder_special",
      accent: "emerald" as const,
    },
    {
      id: "week",
      label: "本周打卡提交",
      value: dash ? "—" : String(i.weekCheckinsCompleted),
      hint: dash
        ? "本周内创建的打卡提交条数（本地自然周）"
        : `本周（${i.weekRangeLabel}）内创建的提交次数`,
      icon: "task_alt",
      accent: "slate" as const,
    },
    {
      id: "progress",
      label: "平均进度",
      value: dash ? "—" : `${i.avgProgressPercent}%`,
      hint: "仅统计有打卡表的计划：已提交槽位 / 总槽位，多计划算术平均",
      icon: "data_usage",
      accent: "teal" as const,
    },
  ];
});

/** 近 12 周趋势柱高（8%–100%）；无数据时用占位骨架 */
const sparkHeights = computed(() => {
  const trend = insights.value?.weeklyCheckinTrend;
  if (!trend?.length || trend.every((n) => n === 0)) {
    return [38, 52, 44, 68, 55, 72, 48, 61, 58, 49, 64, 56];
  }
  const max = Math.max(...trend, 1);
  return trend.map((v) => Math.round(8 + (v / max) * 84));
});

const trendCaption = computed(() =>
  insights.value
    ? "近 12 周打卡提交次数（旧 → 新，末列为当前周）"
    : "占位骨架 · 接入后将展示完成率 / 打卡次数等序列",
);

const trendFootnote = computed(() =>
  insights.value
    ? "柱高按各周提交次数相对缩放，可与 KPI 对照查看节奏。"
    : "柱高仅为视觉占位，不代表当前账户数据",
);

const trendAria = computed(() =>
  insights.value
    ? "近十二周每周打卡提交次数柱状示意"
    : "趋势占位图，非真实数据",
);

async function loadInsights() {
  if (!authState.token) {
    insights.value = null;
    loading.value = false;
    return;
  }
  loading.value = true;
  errorToastMessage.value = "";
  try {
    insights.value = await getApiClient().getUserInsights({
      token: authState.token,
    });
  } catch (e) {
    errorToastMessage.value =
      e instanceof Error ? e.message : "加载统计数据失败";
    insights.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadInsights();
});
</script>

<template>
  <div
    class="insights-root relative flex h-full min-h-0 w-full flex-col overflow-hidden font-plan text-stone-800"
  >
    <UiErrorToast
      :message="errorToastMessage"
      @close="errorToastMessage = ''"
    />

    <!-- 氛围底：与概览同系柔光 + 轻噪点 -->
    <div
      class="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl opacity-[0.94]"
      aria-hidden="true"
    >
      <div
        class="absolute -left-20 -top-16 h-72 w-72 rounded-full bg-[#9fd4b8]/35 blur-3xl"
      />
      <div
        class="absolute -bottom-28 right-[-12%] h-80 w-80 rounded-full bg-[#c8ebe0]/55 blur-3xl"
      />
      <div
        class="absolute left-1/3 top-1/2 h-56 w-56 -translate-y-1/2 rounded-full bg-[#7ec8e8]/12 blur-3xl"
      />
      <div class="insights-home-grain absolute inset-0" />
    </div>

    <header class="relative mb-5 shrink-0 sm:mb-6">
      <PageSectionHeading kicker="数据洞察" title="统计分析">
        <p class="max-w-2xl text-[13px] leading-relaxed text-[#5a6b62]">
          <template v-if="loading && insights == null">
            正在加载你的执行概览…
          </template>
          <template v-else-if="insights == null && !loading && !authState.token">
            登录后可查看与你计划、打卡相关的汇总指标。
          </template>
          <template v-else-if="insights == null && !loading && authState.token">
            暂时无法加载汇总数据，请稍后重试或检查网络。
          </template>
          <template v-else>
            汇总进行中计划、本周打卡活跃度与多计划平均完成度。趋势区展示近 12 周打卡提交次数。
          </template>
        </p>
      </PageSectionHeading>
    </header>

    <div class="ui-scrollbar relative min-h-0 flex-1 overflow-y-auto pr-1 pb-2">
      <!-- KPI -->
      <section
        class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5"
        aria-label="核心指标"
      >
        <article
          v-for="(card, i) in kpiCards"
          :key="card.id"
          class="insight-kpi-card group relative overflow-hidden rounded-[1.35rem] border border-white/70 bg-white/78 p-5 shadow-[0_18px_48px_-28px_rgba(15,60,40,0.22),0_0_0_1px_rgba(16,185,129,0.05)_inset] backdrop-blur-md sm:p-6"
          :style="{ '--insight-i': String(i) }"
        >
          <div
            class="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full opacity-60 blur-2xl transition duration-500 group-hover:opacity-90"
            :class="{
              'bg-emerald-200/50': card.accent === 'emerald',
              'bg-slate-200/45': card.accent === 'slate',
              'bg-teal-200/45': card.accent === 'teal',
            }"
            aria-hidden="true"
          />
          <div class="relative flex items-start gap-4">
            <span
              class="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-[0_6px_20px_-8px_rgba(15,60,40,0.35)] ring-1 ring-white/90"
              :class="{
                'bg-gradient-to-br from-emerald-50 to-white text-emerald-700 ring-emerald-100/80':
                  card.accent === 'emerald',
                'bg-gradient-to-br from-stone-50 to-white text-stone-600 ring-stone-200/70':
                  card.accent === 'slate',
                'bg-gradient-to-br from-teal-50 to-white text-teal-800 ring-teal-100/75':
                  card.accent === 'teal',
              }"
            >
              <span class="material-symbols-outlined text-[26px]">{{
                card.icon
              }}</span>
            </span>
            <div class="min-w-0 flex-1">
              <p
                class="text-[11px] font-bold uppercase tracking-[0.2em] text-[#6e7b75]"
              >
                {{ card.label }}
              </p>
              <p
                class="mt-2 font-mono text-3xl font-black tabular-nums tracking-tight text-[#0f2918] sm:text-[2rem]"
                :class="{
                  'text-[#0a8f4a]': card.accent === 'emerald',
                }"
              >
                {{ card.value }}
              </p>
              <p class="mt-2 text-[12px] leading-snug text-stone-500">
                {{ card.hint }}
              </p>
              <div
                class="insight-kpi-track mt-4 h-1.5 overflow-hidden rounded-full bg-stone-200/80"
                aria-hidden="true"
              >
                <div
                  class="insight-kpi-fill h-full rounded-full"
                  :style="
                    card.id === 'progress' && insights
                      ? {
                          width: `${Math.min(100, Math.max(4, insights.avgProgressPercent))}%`,
                        }
                      : {}
                  "
                />
              </div>
            </div>
          </div>
        </article>
      </section>

      <!-- 趋势 + 说明 -->
      <div class="grid grid-cols-1 gap-5 lg:grid-cols-5 lg:gap-6">
        <section
          class="insight-panel relative overflow-hidden rounded-[1.35rem] border border-white/70 bg-white/75 p-5 shadow-[0_18px_48px_-28px_rgba(15,60,40,0.2),0_0_0_1px_rgba(16,185,129,0.05)_inset] backdrop-blur-md sm:p-6 lg:col-span-3"
          aria-labelledby="insights-trend-heading"
        >
          <div
            class="pointer-events-none absolute right-0 top-0 h-40 w-40 translate-x-1/4 -translate-y-1/4 rounded-full bg-gradient-to-bl from-emerald-100/40 to-transparent"
            aria-hidden="true"
          />
          <div class="relative mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="insights-trend-heading"
                class="text-base font-bold tracking-tight text-[#0f2918]"
              >
                指标趋势
              </h2>
              <p class="mt-1 text-[12px] text-stone-500">
                {{ trendCaption }}
              </p>
            </div>
            <span
              class="inline-flex items-center gap-1.5 rounded-full border border-stone-200/80 bg-stone-50/90 px-3 py-1 text-[11px] font-semibold text-stone-600 ring-1 ring-white/80"
            >
              <span
                class="material-symbols-outlined text-[16px] text-stone-400"
                aria-hidden="true"
                >show_chart</span
              >
              {{ insights ? "12 周" : "示例周视图" }}
            </span>
          </div>
          <div
            class="insight-spark-wrap relative flex h-40 items-end gap-1 rounded-2xl border border-stone-100/90 bg-gradient-to-b from-stone-50/90 to-white/60 px-3 pb-3 pt-6 ring-1 ring-white/80 sm:h-44 sm:gap-1.5 sm:px-4"
            role="img"
            :aria-label="trendAria"
          >
            <div
              class="absolute inset-x-0 top-3 flex justify-between px-1 text-[10px] font-medium uppercase tracking-wider text-stone-400"
            >
              <span>W1</span>
              <span>W4</span>
              <span>W8</span>
              <span>W12</span>
            </div>
            <div
              v-for="(h, idx) in sparkHeights"
              :key="`w-${idx}`"
              class="insight-spark-bar flex-1 rounded-t-sm bg-gradient-to-t from-emerald-600/85 to-emerald-400/50 opacity-80 shadow-[inset_0_-1px_0_rgba(255,255,255,0.35)]"
              :style="{ height: `${h}%`, '--i': idx }"
            />
          </div>
          <p class="relative mt-3 text-center text-[11px] text-stone-400">
            {{ trendFootnote }}
          </p>
        </section>

        <aside
          class="insight-panel relative flex flex-col overflow-hidden rounded-[1.35rem] border border-emerald-100/60 bg-gradient-to-b from-emerald-50/40 to-white/80 p-5 shadow-[0_14px_40px_-24px_rgba(15,80,48,0.25)] backdrop-blur-md sm:p-6 lg:col-span-2"
          aria-label="数据说明"
        >
          <div class="mb-3 flex items-center gap-2">
            <span
              class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/90 text-emerald-700 shadow-sm ring-1 ring-emerald-100/80"
            >
              <span class="material-symbols-outlined text-[22px]">hub</span>
            </span>
            <h2 class="text-sm font-bold text-[#0f2918]">数据口径</h2>
          </div>
          <ul class="space-y-3 text-[13px] leading-relaxed text-[#4a5c54]">
            <li class="flex gap-2">
              <span
                class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                aria-hidden="true"
              />
              <span
                ><strong class="font-semibold text-[#0f2918]">进行中</strong>
                与「我的计划」列表一致，不含回收站与归档。</span
              >
            </li>
            <li class="flex gap-2">
              <span
                class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                aria-hidden="true"
              />
              <span
                ><strong class="font-semibold text-[#0f2918]">本周提交</strong>
                按本地时区周一至周日窗口内，新建打卡提交的次数。</span
              >
            </li>
            <li class="flex gap-2">
              <span
                class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                aria-hidden="true"
              />
              <span
                ><strong class="font-semibold text-[#0f2918]">平均进度</strong>
                有打卡表的计划：至少一条提交的槽位数 ÷ 槽位总数，再对多计划取平均。</span
              >
            </li>
          </ul>
          <div
            class="mt-auto border-t border-emerald-100/70 pt-4 text-[11px] text-stone-500"
          >
            归档计划不计入「进行中」与平均进度；历史提交仍计入周趋势与「本周提交」。
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.insights-home-grain {
  opacity: 0.038;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

.insight-kpi-fill {
  width: 32%;
  background: linear-gradient(90deg, #0a8f4a, #34d399);
  opacity: 0.35;
}

@media (prefers-reduced-motion: no-preference) {
  .insight-kpi-card {
    animation: insight-card-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) backwards;
    animation-delay: calc(var(--insight-i, 0) * 70ms);
  }

  .insight-panel {
    animation: insight-card-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.12s backwards;
  }

  .insight-kpi-fill {
    animation: insight-shimmer 2.4s ease-in-out infinite;
  }

  .insight-spark-bar {
    animation: insight-bar-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards;
    animation-delay: calc(var(--i, 0) * 25ms);
  }
}

.insight-spark-bar {
  min-height: 8%;
}

@keyframes insight-card-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes insight-shimmer {
  0%,
  100% {
    opacity: 0.28;
    transform: translateX(0);
  }
  50% {
    opacity: 0.55;
    transform: translateX(18%);
  }
}

@keyframes insight-bar-in {
  from {
    opacity: 0;
    transform: scaleY(0.2);
    transform-origin: bottom;
  }
  to {
    opacity: 0.8;
    transform: scaleY(1);
    transform-origin: bottom;
  }
}

@media (prefers-reduced-motion: reduce) {
  .insight-kpi-card,
  .insight-panel {
    animation: none;
  }

  .insight-kpi-fill {
    animation: none;
  }

  .insight-spark-bar {
    animation: none;
  }
}
</style>
