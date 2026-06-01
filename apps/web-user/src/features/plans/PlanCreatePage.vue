<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getApiBaseURL,
  getApiClient,
  HttpApiError,
  type PlanAssistantResult,
} from "../../lib/api-client";
import { renderMarkdownToHtml } from "../../lib/render-markdown";
import { consumePlanAssistantStream } from "../../lib/plan-assistant-stream";
import { storeDraftStreamPayload } from "../../lib/plan-assistant-stream";
import { trackEvent } from "../../lib/telemetry";
import { authState, refreshAuthBillingFromApi } from "../../stores/auth";
import UiErrorToast from "../../components/UiErrorToast.vue";
import UiSunriseSelect from "../../components/UiSunriseSelect.vue";

type PlanMode = "basic" | "pro";
type CycleValue = "1w" | "1m" | "3m" | "6m" | "custom";
type PlanScenario = "study" | "travel" | "other";
type StartingPoint =
  | ""
  | "none"
  | "newbie"
  | "junior"
  | "intermediate"
  | "advanced";
type GranularityMode = "smart" | "deep" | "rough";
type ReminderMode = "standard" | "smart";
type AiDepth = "basic" | "advanced";
type ChatRole = "assistant" | "user";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

const router = useRouter();
const route = useRoute();

type AssistantSchedule = {
  granularity: "day" | "week";
  slots: Array<{ slotKey: string; content: string }>;
};

function formatDate(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function addDays(base: string, days: number) {
  const date = parseDate(base);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function addMonths(base: string, months: number) {
  const date = parseDate(base);
  date.setMonth(date.getMonth() + months);
  return formatDate(date);
}

function computeDeadlineByCycle(startDate: string, cycle: CycleValue) {
  if (cycle === "1w") return addDays(startDate, 7);
  if (cycle === "1m") return addMonths(startDate, 1);
  if (cycle === "3m") return addMonths(startDate, 3);
  if (cycle === "6m") return addMonths(startDate, 6);
  return "";
}

function toIsoStartOfDay(dateStr: string) {
  return `${dateStr}T00:00:00.000Z`;
}

function calcDurationDays(startDate: string, endDate: string) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const diff = end.getTime() - start.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, days);
}

const today = formatDate(new Date());
/** 已从服务端拉取计划助手上下文（偏好 + 摘要注入由后端完成） */
const planAssistantMemoryLoaded = ref(false);
const planAssistantMemoryDismissed = ref(false);
const isSubmitting = ref(false);
const showUpgradeHint = ref(false);
const planTierMode = ref<PlanMode>("basic");
const isProMode = computed(() => planTierMode.value === "pro");
const uploadedPlanFileName = ref("");
const uploadedFileHint = ref("");
const chatInput = ref("");
const isAiThinking = ref(false);
/** 流式生成初稿时对应的气泡 id，用于加宽样式与滚到底部 */
const assistantDraftStreamMessageId = ref<string | null>(null);
const planAssistantChatWindowRef = ref<HTMLElement | null>(null);
let planAssistantChatScrollRaf = 0;
function scrollPlanAssistantChatToBottom() {
  if (planAssistantChatScrollRaf) return;
  planAssistantChatScrollRaf = requestAnimationFrame(() => {
    planAssistantChatScrollRaf = 0;
    const el = planAssistantChatWindowRef.value;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  });
}
const errorToastMessage = ref("");
const focusAreas = ref<string[]>([]);
const focusAreaInput = ref("");
const focusAreaHint = ref("");
const MAX_FOCUS_AREAS = 8;
/** 普通版「更多选填」折叠面板默认收起，减轻首屏压力 */
const basicOptionalExpanded = ref(false);

const basicOptionalFilledCount = computed(() => {
  let n = 0;
  if (form.startingPoint) n++;
  if (form.preference.trim()) n++;
  if (focusAreas.value.length > 0) n++;
  if (form.timeInvestment !== "none") n++;
  if (form.granularityMode !== "smart") n++;
  return n;
});

const chatMessages = ref<ChatMessage[]>([
  {
    id: "chat-init",
    role: "assistant",
    content:
      "你好，我是你的计划助手。先把上面的基础信息填一下，然后点「生成一版初稿」。我会先给你一个可执行的版本，我们再一起微调。",
  },
]);

const assistantSchedule = ref<AssistantSchedule | null>(null);

// Pro 助手：B gate（生成初稿后必须确认优化才能提交）
const proDraftGenerated = ref(false);
const proOptimizationConfirmed = ref(false);
const proPendingContent = ref<string | null>(null);
const proPendingSchedule = ref<AssistantSchedule | null>(null);
const proMeta = ref<PlanAssistantResult["meta"] | null>(null);
const proSelectedOptionId = ref<
  "more_granular" | "save_time" | "more_steady" | "more_aggressive" | ""
>("");
const proCustomOptimization = ref("");
const proApplyLoading = ref(false);

function selectProOptimizationOption(id: string) {
  if (
    id === "more_granular" ||
    id === "save_time" ||
    id === "more_steady" ||
    id === "more_aggressive"
  ) {
    proSelectedOptionId.value = id;
    return;
  }
  proSelectedOptionId.value = "";
}

const form = reactive({
  planScenario: "" as PlanScenario | "",
  goal: "",
  requirement: "",
  startingPoint: "" as StartingPoint,
  startDate: today,
  cycle: "1m" as CycleValue,
  customEndDate: "",
  preference: "",
  timeInvestment: "none",
  timeInvestmentCustomHours: "",
  granularityMode: "smart" as GranularityMode,
  reminderMode: "standard" as ReminderMode,
  aiDepth: "basic" as AiDepth,
  // Travel P1
  travelFrom: "",
  travelTo: "",
  travelEndDate: today,
  travelCompanions: "",
  travelStyles: "",
  travelBudget: "",
  travelTransport: "",
  travelConstraints: "",
});

const errors = reactive({
  planScenario: "",
  goal: "",
  requirement: "",
  startDate: "",
  customEndDate: "",
  timeInvestmentCustomHours: "",
  // Travel P1
  travelFrom: "",
  travelTo: "",
  travelEndDate: "",
});

const scenarioOptions = [
  { label: "学习", value: "study" },
  { label: "旅游", value: "travel" },
  { label: "其它", value: "other" },
] as const;

/** 与计划详情页标签同源：库表 `Plan.type` 为 general | study | work | travel；旅游落 travel，其它落 general */
function planScenarioToApiPlanType(
  scenario: PlanScenario | "",
): "general" | "study" | "travel" {
  if (scenario === "study") return "study";
  if (scenario === "travel") return "travel";
  return "general";
}

const startingPointOptionsMap: Record<
  PlanScenario,
  Array<{ label: string; value: Exclude<StartingPoint, ""> }>
> = {
  study: [
    { label: "零基础", value: "none" },
    { label: "入门", value: "newbie" },
    { label: "进阶", value: "intermediate" },
    { label: "熟练", value: "advanced" },
  ],
  travel: [
    { label: "未成行", value: "none" },
    { label: "有大致方向", value: "newbie" },
    { label: "机酒/行程部分已定", value: "intermediate" },
    { label: "熟路/常旅", value: "advanced" },
  ],
  other: [
    { label: "刚开始", value: "none" },
    { label: "有初步经验", value: "newbie" },
    { label: "可稳定推进", value: "intermediate" },
    { label: "高熟练度", value: "advanced" },
  ],
};

const cycleOptions = [
  { label: "1周", value: "1w" },
  { label: "1个月", value: "1m" },
  { label: "3个月", value: "3m" },
  { label: "半年", value: "6m" },
  { label: "自定义", value: "custom" },
] as const;

const timeInvestmentOptions = [
  { label: "无", value: "none" },
  { label: "每天30分钟", value: "30m_daily" },
  { label: "每天1小时", value: "1h_daily" },
  { label: "每周5小时", value: "5h_weekly" },
  { label: "每周10小时", value: "10h_weekly" },
  { label: "自定义", value: "custom" },
] as const;

const granularityOptions = [
  { label: "智能推荐", value: "smart" },
  { label: "深度计划", value: "deep" },
  { label: "粗略计划", value: "rough" },
] as const;

const travelCompanionOptions = [
  { label: "不设置", value: "" },
  { label: "独自", value: "独自" },
  { label: "情侣", value: "情侣" },
  { label: "朋友/同事", value: "朋友/同事" },
  { label: "亲子", value: "亲子" },
  { label: "带老人", value: "带老人" },
] as const;

const travelBudgetOptions = [
  { label: "不设置", value: "" },
  { label: "经济", value: "经济" },
  { label: "舒适", value: "舒适" },
  { label: "高端", value: "高端" },
] as const;

const travelStyleChipOptions = [
  "松弛",
  "特种兵",
  "文化博物馆",
  "美食",
  "摄影",
  "自然徒步",
  "购物",
] as const;

const travelTransportChipOptions = [
  "飞机",
  "高铁",
  "自驾",
  "公共交通优先",
  "步行友好",
] as const;

const isTravelScenario = computed(() => form.planScenario === "travel");
const isOtherScenario = computed(() => form.planScenario === "other");

function normalizeCommaSeparatedTags(input: string): string[] {
  return input
    .split(/[,，/、\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function toggleCommaSeparatedTag(params: {
  current: string;
  tag: string;
}): string {
  const list = normalizeCommaSeparatedTags(params.current);
  const idx = list.indexOf(params.tag);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(params.tag);
  return list.join("、");
}

const effectiveDeadline = computed(() => {
  if (isTravelScenario.value) return form.travelEndDate;
  if (form.cycle === "custom") return form.customEndDate;
  return computeDeadlineByCycle(form.startDate, form.cycle);
});

function buildTravelRequirementTemplate() {
  const from = form.travelFrom.trim();
  const to = form.travelTo.trim();
  const startDate = form.startDate || today;
  const endDate = form.travelEndDate || startDate;
  const days = calcDurationDays(startDate, endDate);
  const companions = form.travelCompanions?.trim() || "未设置";
  const styles = form.travelStyles.trim() || "未设置";
  const budget = form.travelBudget?.trim() || "未设置";
  const transport = form.travelTransport.trim() || "未设置";
  const constraints = form.travelConstraints.trim() || "未设置";

  return [
    "【旅行类型】旅游",
    `【出发地】${from || "（待填写）"}`,
    `【目的地】${to || "（待填写）"}`,
    `【日期】${startDate} - ${endDate}（共 ${days} 天）`,
    `【同行人】${companions}`,
    `【风格偏好】${styles}`,
    `【预算】${budget}`,
    `【交通偏好】${transport}`,
    `【约束与偏好】${constraints}`,
  ].join("\n");
}

watch(
  () => [
    form.startDate,
    form.cycle,
    effectiveDeadline.value,
    form.granularityMode,
  ],
  () => {
    assistantSchedule.value = null;
  },
);

function attachScheduleJsonToRequirement(
  text: string,
  schedule: AssistantSchedule | null,
) {
  const trimmed = text.trim();
  if (!schedule) return trimmed;
  const planScheduleData = {
    schedule: {
      granularity: schedule.granularity,
      slots: schedule.slots.map((s) => ({
        slotKey: s.slotKey,
        content: s.content,
      })),
    },
  };
  return `${trimmed}\n\n\`\`\`json\n${JSON.stringify(planScheduleData, null, 2)}\n\`\`\``;
}

function normalizedPendingScheduleFromAssistant(
  schedule: PlanAssistantResult["schedule"],
): AssistantSchedule | null {
  if (!schedule?.slots?.length) return null;
  return {
    granularity: schedule.granularity,
    slots: schedule.slots.map((s) => ({
      slotKey: s.slotKey,
      content: s.content,
    })),
  };
}

/** 对话助手返回的新稿：写入 pending（提交时用），不修改「计划内容」输入框 */
function applyChatAssistantResult(response: PlanAssistantResult) {
  const text = response.suggestedContent?.trim();
  if (text) proPendingContent.value = response.suggestedContent;
  const sch = normalizedPendingScheduleFromAssistant(response.schedule);
  if (sch) {
    proPendingSchedule.value = sch;
    assistantSchedule.value = sch;
  }
  if (response.meta !== undefined && response.meta !== null) {
    proMeta.value = response.meta;
  }
}

const recommendedMode = computed<GranularityMode>(() => {
  const endDate = effectiveDeadline.value || form.startDate;
  const days = calcDurationDays(form.startDate, endDate);
  return days < 30 ? "deep" : "rough";
});

const granularityHint = computed(() => {
  if (form.granularityMode !== "smart") return "";
  return recommendedMode.value === "deep"
    ? "推荐：这个周期更适合按天拆分（每天更清晰，也更容易坚持）。"
    : "推荐：这个周期更适合按周推进（先抓主线，再逐步细化）。";
});

const acceptedPlanFileTypes = ["txt", "md", "markdown", "doc", "docx"] as const;

const startingPointOptions = computed(() => {
  if (!form.planScenario) return [];
  return startingPointOptionsMap[form.planScenario];
});

function normalizeFocusArea(raw: string) {
  return raw.trim().replace(/\s+/g, " ");
}

function addFocusArea(raw: string) {
  const next = normalizeFocusArea(raw);
  if (!next) return;
  if (focusAreas.value.includes(next)) {
    focusAreaHint.value = "该重点项已存在";
    return;
  }
  if (focusAreas.value.length >= MAX_FOCUS_AREAS) {
    focusAreaHint.value = `最多添加${MAX_FOCUS_AREAS}个重点项`;
    return;
  }
  focusAreas.value.push(next);
  focusAreaHint.value = "";
}

function removeFocusArea(index: number) {
  if (index < 0 || index >= focusAreas.value.length) return;
  focusAreas.value.splice(index, 1);
  if (
    focusAreas.value.length < MAX_FOCUS_AREAS &&
    focusAreaHint.value.includes("最多添加")
  ) {
    focusAreaHint.value = "";
  }
}

function handleFocusAreaKeydown(event: KeyboardEvent) {
  if (event.key !== "Enter" && event.key !== ",") return;
  event.preventDefault();
  addFocusArea(focusAreaInput.value);
  focusAreaInput.value = "";
}

function handleFocusAreaBlur() {
  if (!focusAreaInput.value.trim()) return;
  addFocusArea(focusAreaInput.value);
  focusAreaInput.value = "";
}

function closeErrorToast() {
  errorToastMessage.value = "";
}

function showErrorToast(message: string) {
  errorToastMessage.value = message;
}

function extractErrorMessage(error: unknown, fallback: string) {
  if (error instanceof HttpApiError) {
    if (error.status === 429) {
      return `${error.message} · 可在「设置」查看本月额度与会员说明`;
    }
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

const aiQuotaSummaryText = computed(() => {
  const q = authState.aiQuota;
  if (!q || !authState.token) return "";
  const left = Math.max(0, q.limit - q.used);
  return `本月智能生成剩余 ${left} / ${q.limit} 次（${q.yearMonth}，UTC）`;
});

/**
 * 落库/创建计划用的「可执行正文」：优先助手产出的初稿/优化版（proPendingContent），
 * 「计划内容」输入框仅保留用户手写或上传的说明，生成初稿/生成计划不得写入该框。
 */
function resolveExecutablePlanRequirement(): string {
  const userNotes = form.requirement.trim();
  const aiDraft = proPendingContent.value?.trim() ?? "";
  if (isTravelScenario.value) {
    const travelTemplate = buildTravelRequirementTemplate();
    if (aiDraft && userNotes) {
      return `${travelTemplate}\n\n---\n【用户自由补充】\n${userNotes}\n\n---\n【AI 生成的计划初稿/优化版】\n${aiDraft}`;
    }
    if (aiDraft) {
      return `${travelTemplate}\n\n---\n【AI 生成的计划初稿/优化版】\n${aiDraft}`;
    }
    if (userNotes) {
      return `${travelTemplate}\n\n---\n【用户自由补充】\n${userNotes}`;
    }
    return travelTemplate;
  }
  if (aiDraft && userNotes) {
    return `${aiDraft}\n\n---\n【用户在「计划内容」中的说明】\n${userNotes}`;
  }
  return aiDraft || userNotes;
}

function getCycleLabel(cycle: CycleValue) {
  const cycleLabelMap: Record<CycleValue, string> = {
    "1w": "1周",
    "1m": "1个月",
    "3m": "3个月",
    "6m": "半年",
    custom: "自定义",
  };
  return cycleLabelMap[cycle];
}

const generatedPrompt = computed(() => {
  if (isTravelScenario.value) {
    const travelTemplate = buildTravelRequirementTemplate();
    const extra = form.requirement.trim();
    const notes = extra ? `\n\n---\n【用户自由补充】\n${extra}` : "";
    return `你是一名资深旅行规划师与行程编排助手。

请基于以下旅行信息，生成一份可执行的旅行行程建议（偏攻略/路线/提醒），输出尽量贴近“每天怎么走、怎么坐车、要提前预约什么、备选方案是什么”。

【旅行信息（固定结构）】
${travelTemplate}${notes}

【输出要求】
1. 按天输出行程（早/午/晚），包含路线顺序
2. 标注交通方式与通勤时长估计（粗略即可）
3. 给出预约/门票/营业时间/高峰人流提醒（如适用）
4. 提供至少 2 条备选方案（下雨/人多/体力不足等）
5. 每天给 1 条可选“旅行记录建议”（一句话/拍照点）

请直接输出最终行程内容。`;
  }

  const endDateText = effectiveDeadline.value || form.startDate || today;
  const scenarioLabel =
    scenarioOptions.find((item) => item.value === form.planScenario)?.label ??
    "未指定";
  const contextLines = [
    `- 计划场景：${scenarioLabel}`,
    `- 目标名称：${form.goal || "（待补充）"}`,
    `- 目标说明：${form.requirement || "（待补充）"}`,
    `- 计划开始时间：${form.startDate || today}`,
    `- 计划周期：${getCycleLabel(form.cycle)}（预计完成：${endDateText}）`,
  ];
  if (form.startingPoint)
    contextLines.push(`- 起点状态：${form.startingPoint}`);
  if (form.preference.trim())
    contextLines.push(`- 偏好与约束：${form.preference.trim()}`);
  if (focusAreas.value.length)
    contextLines.push(`- 重点倾斜/薄弱项：${focusAreas.value.join("、")}`);
  if (form.timeInvestment === "custom" && form.timeInvestmentCustomHours) {
    contextLines.push(
      `- 可投入时间：每周约 ${form.timeInvestmentCustomHours} 小时`,
    );
  } else if (form.timeInvestment !== "none") {
    contextLines.push(`- 可投入时间：${form.timeInvestment}`);
  }
  contextLines.push(`- 计划颗粒度：${form.granularityMode}`);

  return `你是一名资深 AI 计划顾问与执行教练。

请基于以下用户基础信息，生成一份高可执行、可跟踪、可复盘的计划方案。该请求可能属于学习、旅游出行或其它个人目标，请先结合用户所选场景与补充说明判断侧重点，再输出计划。

【用户基础信息】
${contextLines.join("\n")}

【输出要求】
1. 先给出你判断的场景类型（学习/旅游/其它）与判断依据
2. 生成阶段化计划（按周期拆分），每个阶段提供明确目标与验收标准
3. 给出可执行任务清单（优先具体到周，必要时细化到天）
4. 提供风险点与应对策略（至少3条）
5. 提供复盘建议与下一步迭代方向

【风格要求】
- 内容要务实、可执行，不空泛
- 优先工程化表达：步骤清晰、可检查、可落地
- 如果用户信息不足，请在结尾列出“还需要补充的信息”

请直接输出最终计划内容。`;
});

function normalizeMode(raw: unknown): PlanMode {
  const requested = raw === "pro" || raw === "basic" ? raw : null;
  if (requested === "pro" && authState.tier !== "pro") return "basic";
  if (requested === "basic") return "basic";
  return authState.tier === "pro" ? "pro" : "basic";
}

function syncModeFromRoute() {
  const normalized = normalizeMode(route.query.mode);
  if (planTierMode.value !== normalized) {
    planTierMode.value = normalized;
  }

  if (route.query.mode !== normalized) {
    router.replace({
      query: {
        ...route.query,
        mode: normalized,
      },
    });
  }
}

/** 从已完成计划「续航」创建时，由 query.continuationFrom 解析并 POST /plans 写 parentPlanId */
const continuationParentPlanId = ref<string | null>(null);

async function hydrateContinuationFromRoute() {
  const raw = route.query.continuationFrom;
  const id = typeof raw === "string" && raw.trim() ? raw.trim() : "";
  if (!id) {
    continuationParentPlanId.value = null;
    return;
  }
  if (!authState.token) return;
  try {
    const src = await getApiClient().getPlan({
      id,
      token: authState.token,
    });
    const ns = (src.nextStep ?? "").trim();
    if (!ns) {
      continuationParentPlanId.value = null;
      return;
    }
    continuationParentPlanId.value = id;
    const g = (src.goal ?? "").trim() || "上一计划";
    if (!form.goal.trim()) {
      form.goal = `${g} · 下一步`;
    }
    if (!form.requirement.trim()) {
      form.requirement = `${ns}\n\n（承接自已完成计划「${g}」，请主要依据上一阶段的「下一步迭代方向」生成新计划，勿复述旧计划全文。）`;
    }
    if (!form.planScenario) {
      form.planScenario = "other";
    }
  } catch {
    continuationParentPlanId.value = null;
  }
}

/** 创建页进入：拉取助手上下文，并按画像填充默认场景/周投入（不覆盖续航或用户已选项） */
async function loadPlanAssistantUserContext() {
  planAssistantMemoryLoaded.value = false;
  if (!authState.token) return;
  try {
    const ctx = await getApiClient().getPlanAssistantContext({
      token: authState.token,
    });
    planAssistantMemoryLoaded.value = true;
    const hadContinuation = Boolean(route.query.continuationFrom);
    if (!hadContinuation && !form.planScenario) {
      const ds = ctx.profile.defaultScenario;
      if (ds === "study") form.planScenario = "study";
      else if (ds === "travel") form.planScenario = "travel";
      else if (ds === "work" || ds === "general") form.planScenario = "other";
    }
    const cap = ctx.profile.weeklyHoursCap;
    if (
      cap != null &&
      cap > 0 &&
      form.timeInvestment === "none" &&
      !hadContinuation
    ) {
      form.timeInvestment = "custom";
      form.timeInvestmentCustomHours = String(cap);
    }
  } catch {
    planAssistantMemoryLoaded.value = false;
  }
}

function validateForm() {
  errors.planScenario = form.planScenario ? "" : "请选择计划场景";
  errors.goal = form.goal.trim() ? "" : "请输入计划名称";
  errors.travelFrom = "";
  errors.travelTo = "";
  errors.travelEndDate = "";
  if (isTravelScenario.value) {
    errors.requirement = "";
    errors.travelFrom = form.travelFrom.trim() ? "" : "请输入出发地";
    errors.travelTo = form.travelTo.trim() ? "" : "请输入目的地";
    errors.travelEndDate = form.travelEndDate ? "" : "请选择结束日期";
  } else {
    errors.requirement = form.requirement.trim() ? "" : "请输入计划内容";
  }
  errors.startDate = form.startDate ? "" : "请选择开始日期";
  errors.customEndDate =
    !isTravelScenario.value && form.cycle === "custom" && !form.customEndDate
      ? "请选择完成日期"
      : "";
  errors.timeInvestmentCustomHours =
    form.timeInvestment === "custom" &&
    (!form.timeInvestmentCustomHours ||
      Number.isNaN(Number(form.timeInvestmentCustomHours)) ||
      Number(form.timeInvestmentCustomHours) <= 0)
      ? "请输入每周大概能投入的小时数（需大于 0）"
      : "";
  return (
    !errors.planScenario &&
    !errors.goal &&
    !errors.requirement &&
    !errors.travelFrom &&
    !errors.travelTo &&
    !errors.travelEndDate &&
    !errors.startDate &&
    !errors.customEndDate &&
    !errors.timeInvestmentCustomHours
  );
}

async function handleSubmit() {
  if (!validateForm()) return;
  if (
    isProMode.value &&
    authState.tier === "pro" &&
    proDraftGenerated.value &&
    !proOptimizationConfirmed.value
  ) {
    showErrorToast("还差一步：请先在「计划助手」确认一次优化版本，再生成计划。");
    return;
  }
  isSubmitting.value = true;
  const planScenario = form.planScenario as PlanScenario;

  const client = getApiClient();
  /** 若 Pro 直接点「立即生成计划」（未生成初稿），则先走一次 Pro Agent 自生成自优化 */
  if (isProMode.value && authState.tier === "pro" && !proDraftGenerated.value) {
    try {
      const response = await client.planAssistant({
        token: authState.token,
        mode: "draft",
    goal: form.goal,
        requirement: generatedPrompt.value,
        startDate: form.startingPoint ? form.startDate : form.startDate,
        cycle: form.cycle,
        endDate: effectiveDeadline.value || form.startDate,
        granularityMode: form.granularityMode,
        tier: "pro",
        agent: "pro",
      });
      proDraftGenerated.value = true;
      proOptimizationConfirmed.value = true;
      proMeta.value = response.meta ?? null;
      proPendingContent.value = response.suggestedContent;
      proPendingSchedule.value = response.schedule
        ? {
            granularity: response.schedule.granularity,
            slots: response.schedule.slots.map((s) => ({
              slotKey: s.slotKey,
              content: s.content,
            })),
          }
        : null;
      assistantSchedule.value = proPendingSchedule.value;
      chatMessages.value.push({
        id: `chat-pro-auto-${Date.now()}`,
        role: "assistant",
        content: "我已经先帮你生成并优化了一版计划。接下来你可以直接点击「立即生成计划」。",
      });
    } catch (e) {
      if (e instanceof HttpApiError && e.status === 429) {
        showErrorToast(
          extractErrorMessage(e, "本月智能生成次数已用尽。"),
        );
        void refreshAuthBillingFromApi();
      } else {
        showErrorToast(
          extractErrorMessage(e, "智能生成暂时用不了，我先用基础方式帮你继续创建。"),
        );
      }
    }
  }

  /** 可执行正文：有助手初稿/优化版时用其落库，并保留用户在「计划内容」中的说明（见 resolveExecutablePlanRequirement） */
  const finalRequirement = resolveExecutablePlanRequirement();
  const finalRequirementForSubmit = attachScheduleJsonToRequirement(
    finalRequirement,
    assistantSchedule.value,
  );

  const effectiveEndDate = effectiveDeadline.value || form.startDate;
  const submitCycle: CycleValue = isTravelScenario.value ? "custom" : form.cycle;
  const submitGranularityMode: GranularityMode = isTravelScenario.value
    ? "deep"
    : form.granularityMode;
  const submitTimeInvestment = isTravelScenario.value
    ? "none"
    : form.timeInvestment === "custom"
      ? `custom:${Number(form.timeInvestmentCustomHours)}h_weekly`
      : form.timeInvestment;
  const submitTimeInvestmentCustomHours =
    !isTravelScenario.value && form.timeInvestment === "custom"
      ? Number(form.timeInvestmentCustomHours)
      : undefined;
  const submitCurrentLevel = form.startingPoint || "none";
  const submitPlanContent = isTravelScenario.value
    ? (() => {
        const extra = form.requirement.trim();
        return extra
          ? `${buildTravelRequirementTemplate()}\n\n---\n【用户自由补充】\n${extra}`
          : buildTravelRequirementTemplate();
      })()
    : finalRequirement;

  const profile = {
    planMode: planTierMode.value,
    basicInfo: {
      planScenario,
      planName: form.goal,
      planContent: submitPlanContent,
      startingPoint: form.startingPoint,
      currentLevel: form.startingPoint || "none",
      startDate: form.startDate,
      cycle: submitCycle,
      endDate: effectiveEndDate,
      preference: form.preference.trim(),
      focusAreas: focusAreas.value,
      timeInvestment: submitTimeInvestment,
      timeInvestmentCustomHours: submitTimeInvestmentCustomHours,
      outputMode: "daily",
      granularityMode: submitGranularityMode,
    },
    proSettings: isProMode.value
      ? {
          aiDepth: form.aiDepth,
          reminderMode: form.reminderMode,
        }
      : undefined,
  };

  const planPayloadDraft = {
    basic: {
      planScenario,
      goal: form.goal,
      requirement: finalRequirement,
      startDate: form.startDate,
      cycle: form.cycle,
      deadline: effectiveDeadline.value,
      startingPoint: form.startingPoint,
      preference: form.preference,
      focusAreas: focusAreas.value,
      timeInvestment:
        form.timeInvestment === "custom"
          ? `custom:${Number(form.timeInvestmentCustomHours)}h_weekly`
          : form.timeInvestment,
      granularityMode: form.granularityMode,
    },
    advanced: isProMode.value
      ? {
          aiDepth: form.aiDepth,
          reminderMode: form.reminderMode,
        }
      : null,
  };
  void planPayloadDraft;

  const deadline = toIsoStartOfDay(effectiveEndDate || form.startDate);
  const parentContinuationId = continuationParentPlanId.value ?? undefined;
  const apiPlanType = planScenarioToApiPlanType(form.planScenario as PlanScenario);
  let plan;
  try {
    plan = await client.createPlan({
      goal: form.goal,
      deadline,
      requirement: finalRequirementForSubmit,
      type: apiPlanType,
      token: authState.token,
      profile,
      ...(parentContinuationId ? { parentPlanId: parentContinuationId } : {}),
    });
  } catch (error) {
    showErrorToast(
      extractErrorMessage(error, "刚刚没创建成功，我正在帮你再试一次。"),
    );
    // Backward compatibility for older /plans contract.
    try {
      plan = await client.createPlan({
        goal: form.goal,
        deadline,
        requirement: finalRequirementForSubmit,
        type: apiPlanType,
        token: authState.token,
        ...(parentContinuationId ? { parentPlanId: parentContinuationId } : {}),
      });
    } catch (retryError) {
      showErrorToast(
        extractErrorMessage(retryError, "还是没创建成功，请稍后再试。"),
      );
      return;
    }
  } finally {
    isSubmitting.value = false;
  }

  continuationParentPlanId.value = null;

  storeDraftStreamPayload(plan.id, {
    assistantPrompt: generatedPrompt.value,
    startDate: form.startDate,
    cycle: form.cycle,
    endDate: effectiveDeadline.value || form.startDate,
    createTier: isProMode.value ? "pro" : "basic",
  });

  trackEvent("plan_create", {
    properties: {
      planId: plan.id,
      type: apiPlanType,
      planScenario: form.planScenario,
    },
  });

  await router.push({ name: "plan-draft", params: { id: plan.id } });
}

function buildAiDraftContent() {
  const cycleLabel = getCycleLabel(form.cycle);
  const endDateText = effectiveDeadline.value || "待确认";
  return [
    `目标：${form.goal}`,
    `起始时间：${form.startDate}`,
    `计划周期：${cycleLabel}`,
    `预计完成：${endDateText}`,
    "",
    "建议执行结构：",
    "1. 启动阶段：明确里程碑与每周目标",
    "2. 执行阶段：按周推进并记录完成情况",
    "3. 收尾阶段：复盘结果并沉淀可复用方法",
    "",
    `补充说明：${form.requirement || "暂无，请继续补充细节。"}`,
  ].join("\n");
}

async function handleGenerateAiDraft() {
  if (!form.goal.trim()) {
    errors.goal = "请输入计划名称";
    return;
  }
  if (!form.startDate) {
    errors.startDate = "请选择开始日期";
    return;
  }
  isAiThinking.value = true;
  const client = getApiClient();
  /** 本次若走了流式，对应助手气泡 id（完成后合并为终稿，避免再插一条短消息把长文顶上去） */
  let streamDraftMsgId: string | null = null;
  try {
    const isTest = import.meta.env.MODE === "test";

    // 非测试环境优先走流式（像 ChatGPT 一样逐字输出）；测试环境仍走非流式 mock，避免复杂的 stream mocking
    let response: PlanAssistantResult | null = null;
    let streamHardFailed = false;
    if (!isTest && authState.token) {
      const streamAssistantId = `chat-draft-stream-${Date.now()}`;
      streamDraftMsgId = streamAssistantId;
      assistantDraftStreamMessageId.value = streamAssistantId;
      chatMessages.value.push({
        id: streamAssistantId,
        role: "assistant",
        content: "正在生成初稿…",
      });
      await nextTick();
      scrollPlanAssistantChatToBottom();
      let streamed = "";
      await consumePlanAssistantStream(
        getApiBaseURL(),
        authState.token,
        {
          mode: "draft",
          goal: form.goal,
          requirement: generatedPrompt.value,
          startDate: form.startDate,
          cycle: form.cycle,
          endDate: effectiveDeadline.value || form.startDate,
          granularityMode: form.granularityMode,
          tier: isProMode.value ? "pro" : "basic",
          agent: isProMode.value ? "pro" : "basic",
        },
        {
          onDelta: (t) => {
            streamed += t;
            const msg = chatMessages.value.find(
              (m) => m.id === streamAssistantId,
            );
            if (msg) msg.content = streamed.trim() ? streamed : "正在生成初稿…";
            scrollPlanAssistantChatToBottom();
          },
          onMetaReady: (p) => {
            // Pro: meta_ready 会给优化版 suggestedContent + schedule + meta
            response = {
              reply: "已生成初稿（流式）。",
              suggestedContent:
                typeof p.suggestedContent === "string"
                  ? p.suggestedContent
                  : streamed,
              schedule: (p.schedule as any) ?? undefined,
              meta: (p.meta as any) ?? undefined,
            };
          },
          onDone: () => {
            if (!response) {
              response = {
                reply: "已生成初稿（流式）。",
                suggestedContent: streamed,
              };
            }
          },
          onError: (msg) => {
            streamHardFailed = true;
            showErrorToast(
              /次数|用尽|额度/i.test(msg)
                ? `${msg} · 可在「设置」查看会员说明`
                : msg,
            );
            void refreshAuthBillingFromApi();
            const msgEl = chatMessages.value.find(
              (m) => m.id === streamAssistantId,
            );
            if (msgEl) {
              msgEl.content =
                /次数|用尽|额度/i.test(msg) && authState.token
                  ? "本月智能生成次数已用尽或暂时不可用。请前往「设置」查看额度。"
                  : msg;
            }
          },
        },
      );
    }

    if (streamHardFailed) {
      isAiThinking.value = false;
      assistantDraftStreamMessageId.value = null;
      return;
    }

    if (!response) {
      response =
        typeof client.planAssistant === "function"
          ? await client.planAssistant({
              token: authState.token,
              mode: "draft",
              goal: form.goal,
              requirement: generatedPrompt.value,
              startDate: form.startDate,
              cycle: form.cycle,
              endDate: effectiveDeadline.value || form.startDate,
              granularityMode: form.granularityMode,
              tier: isProMode.value ? "pro" : "basic",
              agent: isProMode.value ? "pro" : "basic",
            })
          : {
              reply: "已为你生成一版初稿，你可以继续让我按周/按天细化。",
              suggestedContent: buildAiDraftContent(),
            };
    }

    proDraftGenerated.value = isProMode.value && authState.tier === "pro";
    proOptimizationConfirmed.value = false;
    proMeta.value = response.meta ?? null;
    proPendingContent.value = response.suggestedContent;
    proPendingSchedule.value = response.schedule
      ? {
          granularity: response.schedule.granularity,
          slots: response.schedule.slots.map((s) => ({
            slotKey: s.slotKey,
            content: s.content,
          })),
        }
      : null;

    assistantSchedule.value = proPendingSchedule.value;
    // 流式：终稿写在同一条助手气泡里（用户主要在对话框里跟读）；非流式 / 测试：照旧追加一条
    if (streamDraftMsgId) {
      const msg = chatMessages.value.find((m) => m.id === streamDraftMsgId);
      if (msg) {
        const body = response.suggestedContent?.trim() ?? "";
        msg.content = body || response.reply;
      }
      await nextTick();
      scrollPlanAssistantChatToBottom();
    } else {
      const body =
        response.suggestedContent?.trim() || response.reply.trim() || "";
      chatMessages.value.push({
        id: `chat-draft-${Date.now()}`,
        role: "assistant",
        content: body || response.reply,
      });
    }
    void refreshAuthBillingFromApi();
  } catch (error) {
    if (error instanceof HttpApiError && error.status === 429) {
      showErrorToast(extractErrorMessage(error, "本月智能生成次数已用尽。"));
      void refreshAuthBillingFromApi();
      isAiThinking.value = false;
      assistantDraftStreamMessageId.value = null;
      return;
    }
    const draft = buildAiDraftContent();
    proPendingContent.value = draft;
    proPendingSchedule.value = null;
    showErrorToast(
      extractErrorMessage(error, "智能生成暂时用不了，但我已经先给你生成了一版初稿。"),
    );
    if (streamDraftMsgId) {
      const msg = chatMessages.value.find((m) => m.id === streamDraftMsgId);
      if (msg) {
        msg.content = draft;
      } else {
        chatMessages.value.push({
          id: `chat-draft-fallback-${Date.now()}`,
          role: "assistant",
          content: "智能生成暂时用不了，但我已经先给你生成了一版初稿。",
        });
      }
    } else {
      chatMessages.value.push({
        id: `chat-draft-fallback-${Date.now()}`,
        role: "assistant",
        content: "智能生成暂时用不了，但我已经先给你生成了一版初稿。",
      });
    }
  } finally {
    isAiThinking.value = false;
    assistantDraftStreamMessageId.value = null;
  }
}

async function confirmProOptimizationDefault() {
  if (!isProMode.value || authState.tier !== "pro") return;
  proOptimizationConfirmed.value = true;
  assistantSchedule.value = proPendingSchedule.value;
  chatMessages.value.push({
    id: `chat-pro-confirm-${Date.now()}`,
    role: "assistant",
    content: "好的，我们就按这个版本来。你现在可以点击「立即生成计划」。",
  });
}

async function applyProOptionOrCustom() {
  if (!isProMode.value || authState.tier !== "pro") return;
  if (!proPendingContent.value || !proPendingSchedule.value) {
    showErrorToast("先生成一版初稿，再来选择优化方向。");
    return;
  }
  if (!proSelectedOptionId.value && !proCustomOptimization.value.trim()) {
    showErrorToast("请选择一个优化方向，或写一句你想怎么优化。");
    return;
  }
  const client = getApiClient();
  proApplyLoading.value = true;
  try {
    const res = await client.planAssistantApplyOption({
      token: authState.token,
      baseSuggestedContent: proPendingContent.value,
      baseSchedule: proPendingSchedule.value,
      optionId: proSelectedOptionId.value
        ? (proSelectedOptionId.value as any)
        : undefined,
      customText: proCustomOptimization.value.trim()
        ? proCustomOptimization.value.trim()
        : undefined,
      context: {
        goal: form.goal,
        startDate: form.startDate,
        endDate: effectiveDeadline.value || form.startDate,
        cycle: form.cycle,
        type: planScenarioToApiPlanType(form.planScenario as PlanScenario),
      },
    });
    proOptimizationConfirmed.value = true;
    proPendingContent.value = res.suggestedContent;
    proPendingSchedule.value = res.schedule;
    assistantSchedule.value = res.schedule;
    chatMessages.value.push({
      id: `chat-pro-applied-${Date.now()}`,
      role: "assistant",
      content:
        "已应用你的优化选择并生成新版本。你现在可以点击「立即生成计划」。",
    });
  } catch (e) {
    showErrorToast(extractErrorMessage(e, "刚刚没应用成功，请稍后再试。"));
  } finally {
    proApplyLoading.value = false;
  }
}

async function handleChatSend() {
  const content = chatInput.value.trim();
  if (!content) return;
  chatMessages.value.push({
    id: `chat-user-${Date.now()}`,
    role: "user",
    content,
  });
  chatInput.value = "";
  isAiThinking.value = true;
  const client = getApiClient();
  try {
    const response =
      typeof client.planAssistant === "function"
        ? await client.planAssistant({
            token: authState.token,
            mode: "chat",
            goal: form.goal || "未命名计划",
            requirement: resolveExecutablePlanRequirement(),
            startDate: form.startDate || today,
            cycle: form.cycle,
            endDate: effectiveDeadline.value || form.startDate || today,
            granularityMode: form.granularityMode,
            message: content,
            tier: isProMode.value ? "pro" : "basic",
            agent: isProMode.value ? "pro" : "basic",
          })
        : {
            reply: "已收到补充，我给你整合了一版新内容。",
            suggestedContent: form.requirement.trim()
              ? `${form.requirement.trim()}\n\n用户补充：${content}`
              : content,
          };

    applyChatAssistantResult(response);
    const body =
      response.suggestedContent?.trim() || response.reply.trim() || "";
    chatMessages.value.push({
      id: `chat-ai-${Date.now()}`,
      role: "assistant",
      content: body || response.reply,
    });
  } catch (error) {
    if (error instanceof HttpApiError && error.status === 429) {
      showErrorToast(extractErrorMessage(error, "本月智能生成次数已用尽。"));
      void refreshAuthBillingFromApi();
    } else {
      const mergedRequirement = form.requirement.trim()
        ? `${form.requirement.trim()}\n\n用户补充：${content}`
        : content;
      showErrorToast(
        extractErrorMessage(
          error,
          "对话暂时用不了，但我已经先把你的补充整理进草稿里了。",
        ),
      );
      applyChatAssistantResult({
        reply: "对话暂时用不了，但我已经先把你的补充整理进草稿里了。",
        suggestedContent: mergedRequirement,
      });
      chatMessages.value.push({
        id: `chat-ai-fallback-${Date.now()}`,
        role: "assistant",
        content: mergedRequirement,
      });
    }
  } finally {
    isAiThinking.value = false;
  }
}

function handleChatInputKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void handleChatSend();
  }
}

function getFileExtension(name: string) {
  const index = name.lastIndexOf(".");
  if (index < 0) return "";
  return name.slice(index + 1).toLowerCase();
}

async function readTextFromFile(file: File) {
  if (typeof file.text === "function") {
    return await file.text();
  }
  const buffer = await file.arrayBuffer();
  return new TextDecoder().decode(buffer);
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function handlePlanFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const extension = getFileExtension(file.name);
  if (
    !acceptedPlanFileTypes.includes(
      extension as (typeof acceptedPlanFileTypes)[number],
    )
  ) {
    uploadedPlanFileName.value = "";
    uploadedFileHint.value =
      "文件格式不支持，请上传 txt / md / doc / docx 文件。";
    input.value = "";
    return;
  }

  uploadedPlanFileName.value = file.name;
  uploadedFileHint.value = `已上传：${file.name}`;
  if (extension === "txt" || extension === "md" || extension === "markdown") {
    const text = (await readTextFromFile(file)).trim();
    if (text) {
      form.requirement = text;
      errors.requirement = "";
      uploadedFileHint.value = `已上传并填充内容：${file.name}`;
    }
    return;
  }

  try {
    uploadedFileHint.value = `已上传：${file.name}，正在解析内容...`;
    const base64 = await fileToBase64(file);
    const client = getApiClient();
    if (typeof client.parsePlanFile !== "function") {
      uploadedFileHint.value = `已上传：${file.name}（当前环境暂不支持解析该格式）`;
      return;
    }
    const parsed = await client.parsePlanFile({
      token: authState.token,
      fileName: file.name,
      contentBase64: base64,
    });
    if (parsed.text.trim()) {
      form.requirement = parsed.text.trim();
      errors.requirement = "";
      uploadedFileHint.value = `已上传并填充内容：${file.name}`;
      return;
    }
    uploadedFileHint.value = `已上传：${file.name}，但未解析到可用文本。`;
  } catch (error) {
    showErrorToast(
      extractErrorMessage(error, "文件解析失败，请手动补充计划内容。"),
    );
    uploadedFileHint.value = `已上传：${file.name}，但没能读取出内容。你可以直接在下方「计划内容」里补充。`;
  }
}

function switchTierMode(mode: PlanMode) {
  if (mode === "pro" && authState.tier !== "pro") {
    showUpgradeHint.value = true;
    return;
  }
  planTierMode.value = mode;
  router.replace({
    query: {
      ...route.query,
      mode,
    },
  });
}

async function goBack() {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  await router.push("/plans");
}

function disableBeforeToday(date: Date) {
  return date.getTime() < parseDate(today).getTime();
}

function disableBeforeStartDate(date: Date) {
  return date.getTime() < parseDate(form.startDate).getTime();
}

watch(
  () => [form.startDate, form.cycle] as const,
  () => {
    if (form.cycle !== "custom") {
      form.customEndDate = "";
    }
  },
);

watch(
  () => isTravelScenario.value,
  () => {
    if (!isTravelScenario.value) return;
    // 旅游：用起止日期控制，弱化学习型字段
    form.cycle = "custom";
    form.granularityMode = "deep";
    form.timeInvestment = "none";
  },
);

watch(
  () => form.planScenario,
  () => {
    if (!form.planScenario) {
      form.startingPoint = "";
      return;
    }
    const validValues = new Set(
      startingPointOptionsMap[form.planScenario].map((item) => item.value),
    );
    if (form.startingPoint && !validValues.has(form.startingPoint)) {
      form.startingPoint = "";
    }
  },
);

watch(
  () => form.timeInvestment,
  () => {
    if (form.timeInvestment !== "custom") {
      form.timeInvestmentCustomHours = "";
    }
  },
);

watch(
  () => focusAreaInput.value,
  () => {
    if (!focusAreaHint.value || focusAreaHint.value.includes("最多添加"))
      return;
    focusAreaHint.value = "";
  },
);

onMounted(async () => {
  syncModeFromRoute();
  await hydrateContinuationFromRoute();
  void refreshAuthBillingFromApi();
  await loadPlanAssistantUserContext();
});
watch(
  () => route.query.mode,
  () => {
    syncModeFromRoute();
  },
);
watch(
  () => route.query.continuationFrom,
  () => {
    void hydrateContinuationFromRoute();
  },
);
watch(
  () => authState.tier,
  () => {
    syncModeFromRoute();
  },
);
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
            <section
              v-if="!isProMode"
              class="create-surface create-surface--hero create-plan-unified-card rounded-2xl border border-[#e6ebe8] bg-white p-5 shadow-sm sm:p-6"
            >
              <div class="plan-create-card-border" aria-hidden="true"></div>
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

            <section
              v-else
              class="space-y-6"
              data-testid="pro-capability-panel"
            >
              <div
                class="create-surface create-surface--hero create-plan-unified-card rounded-2xl border border-[#e6ebe8] bg-white p-5 shadow-sm sm:p-6"
              >
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

<style scoped>
/* 主题与质感：frontend-design · Sunrise 张扬版（有机 + 能量感） */
.plan-create-view {
  --pc-fg: #0a1f14;
  --pc-fg-soft: #2d3b34;
  --pc-muted: #5f6d66;
  --pc-accent: #0f8b4e;
  --pc-accent-hot: #35cd75;
  --pc-accent-deep: #064428;
  --pc-accent-glow: rgba(53, 205, 117, 0.45);
  --pc-line: rgba(27, 111, 73, 0.14);
  background:
    radial-gradient(
      ellipse 130% 90% at 100% -25%,
      rgba(72, 220, 130, 0.28) 0%,
      transparent 52%
    ),
    radial-gradient(
      ellipse 100% 70% at -15% 55%,
      rgba(15, 139, 78, 0.16) 0%,
      transparent 48%
    ),
    radial-gradient(
      ellipse 80% 50% at 50% 110%,
      rgba(185, 226, 206, 0.35) 0%,
      transparent 45%
    ),
    linear-gradient(168deg, #dff3e8 0%, #f0f7f3 32%, #f3f7f4 55%, #e9f4ec 100%);
}

.plan-create-grain {
  position: absolute;
  inset: 0;
  z-index: 1;
  opacity: 0.072;
  mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Cfilter id='a'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23a)'/%3E%3C/svg%3E");
}

.plan-create-header-sheen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.7;
  background:
    radial-gradient(
      1200px 70px at 40% 0%,
      rgba(53, 205, 117, 0.22),
      transparent 55%
    ),
    radial-gradient(
      900px 70px at 75% 0%,
      rgba(15, 139, 78, 0.16),
      transparent 60%
    );
  mix-blend-mode: multiply;
}

@media (prefers-reduced-motion: no-preference) {
  .plan-create-header-sheen {
    background-size: 200% 100%;
    animation: plan-create-sheen-pan 9s ease-in-out infinite;
  }
}

@keyframes plan-create-sheen-pan {
  0%,
  100% {
    background-position:
      0% 0%,
      30% 0%;
    opacity: 0.62;
  }
  50% {
    background-position:
      100% 0%,
      80% 0%;
    opacity: 0.86;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .create-plan-unified-card {
    animation: plan-create-card-in 0.65s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
}

@media (prefers-reduced-motion: reduce) {
  .create-plan-unified-card {
    animation: none;
  }
}

@keyframes plan-create-card-in {
  from {
    opacity: 0;
    transform: translateY(22px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.create-page-title {
  background: linear-gradient(
    115deg,
    var(--pc-fg) 0%,
    var(--pc-accent-deep) 28%,
    var(--pc-accent) 52%,
    var(--pc-accent-hot) 78%,
    #0d6b3d 100%
  );
  background-size: 160% 160%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

@media (prefers-reduced-motion: no-preference) {
  .create-page-title {
    animation: plan-create-title-shift 7s ease-in-out infinite;
  }
}

@keyframes plan-create-title-shift {
  0%,
  100% {
    background-position: 0% 40%;
    filter: drop-shadow(0 0 10px rgba(53, 205, 117, 0.22));
  }
  50% {
    background-position: 100% 60%;
    filter: drop-shadow(0 0 18px rgba(53, 205, 117, 0.38));
  }
}

@supports not (background-clip: text) {
  .create-page-title {
    color: var(--pc-accent-deep);
    background: none;
    animation: none;
    filter: none;
  }
}

.plan-create-card-border {
  position: absolute;
  inset: -1px;
  border-radius: 1rem;
  pointer-events: none;
  opacity: 0.55;
  background: linear-gradient(
    130deg,
    rgba(53, 205, 117, 0) 0%,
    rgba(53, 205, 117, 0.28) 22%,
    rgba(255, 255, 255, 0.65) 50%,
    rgba(15, 139, 78, 0.24) 76%,
    rgba(15, 139, 78, 0) 100%
  );
  filter: blur(0.2px);
  mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  padding: 1px;
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}

@media (prefers-reduced-motion: no-preference) {
  .plan-create-card-border {
    background-size: 180% 180%;
    animation: plan-create-border-shift 8s ease-in-out infinite;
  }
}

@keyframes plan-create-border-shift {
  0%,
  100% {
    background-position: 0% 40%;
    opacity: 0.45;
  }
  50% {
    background-position: 100% 60%;
    opacity: 0.72;
  }
}

.tier-tab-active {
  box-shadow:
    0 0 0 1px rgba(15, 139, 78, 0.2),
    0 6px 20px -6px rgba(15, 139, 78, 0.45),
    0 2px 8px -4px rgba(53, 205, 117, 0.35);
}

.tier-tab-rail {
  box-shadow: 0 2px 12px -6px rgba(18, 74, 49, 0.18);
}

@media (prefers-reduced-motion: no-preference) {
  .tier-tab-rail {
    position: relative;
    overflow: hidden;
  }

  .tier-tab-rail::after {
    content: "";
    position: absolute;
    inset: -30% -60%;
    background: radial-gradient(
      circle at 30% 50%,
      rgba(53, 205, 117, 0.18),
      transparent 55%
    );
    transform: translateX(-12%);
    animation: plan-create-rail-breathe 6.5s ease-in-out infinite;
    pointer-events: none;
  }
}

@keyframes plan-create-rail-breathe {
  0%,
  100% {
    transform: translateX(-10%) scale(1);
    opacity: 0.55;
  }
  50% {
    transform: translateX(10%) scale(1.05);
    opacity: 0.95;
  }
}

.field-icon-pulse {
  position: relative;
}

@media (prefers-reduced-motion: no-preference) {
  .field-icon-pulse::after {
    content: "";
    position: absolute;
    inset: -6px;
    border-radius: 999px;
    background: radial-gradient(
      circle,
      rgba(53, 205, 117, 0.35),
      transparent 60%
    );
    animation: plan-create-required-ping 2.6s ease-in-out infinite;
    pointer-events: none;
  }
}

@keyframes plan-create-required-ping {
  0%,
  100% {
    transform: scale(0.85);
    opacity: 0.25;
  }
  40% {
    transform: scale(1.05);
    opacity: 0.65;
  }
  70% {
    transform: scale(0.92);
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .form-control-input:focus,
  .form-control-textarea:focus,
  .form-control-number:focus {
    animation: plan-create-focus-spark 520ms ease-out both;
  }
}

@keyframes plan-create-focus-spark {
  from {
    box-shadow:
      0 0 0 3px rgba(15, 139, 78, 0.14),
      0 4px 16px rgba(18, 74, 49, 0.08),
      0 0 0 0 rgba(53, 205, 117, 0);
  }
  to {
    box-shadow:
      0 0 0 3px rgba(15, 139, 78, 0.14),
      0 4px 16px rgba(18, 74, 49, 0.08),
      0 0 32px -12px rgba(53, 205, 117, 0.22);
  }
}

.field-label {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding-bottom: 0.5rem;
  font-size: 1rem;
  font-weight: 500;
}

.field-icon {
  display: inline-flex;
  height: 1rem;
  width: 1rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 0.625rem;
  line-height: 1;
}

.field-icon.required {
  background: rgba(13, 143, 75, 0.16);
  color: #0d8f4b;
}

.field-icon.optional {
  background: rgba(98, 113, 107, 0.14);
  color: #62716b;
}

.create-surface {
  box-shadow:
    0 20px 50px -32px rgba(18, 74, 49, 0.38),
    0 8px 24px -12px rgba(53, 205, 117, 0.15),
    0 0 0 1px rgba(255, 255, 255, 0.65) inset,
    0 0 48px -20px rgba(53, 205, 117, 0.25);
  transition:
    box-shadow 0.3s ease,
    border-color 0.2s ease,
    transform 0.35s ease;
}

@media (prefers-reduced-motion: no-preference) {
  .create-plan-unified-card.create-surface:hover {
    box-shadow:
      0 24px 56px -36px rgba(18, 74, 49, 0.42),
      0 10px 28px -14px rgba(53, 205, 117, 0.22),
      0 0 0 1px rgba(255, 255, 255, 0.7) inset,
      0 0 56px -18px rgba(53, 205, 117, 0.32);
  }
}

.create-surface--hero {
  background:
    linear-gradient(
      145deg,
      rgba(255, 255, 255, 0.97) 0%,
      rgba(236, 252, 242, 0.55) 38%,
      rgba(255, 255, 255, 0.92) 62%,
      rgba(240, 249, 244, 0.9) 100%
    ),
    linear-gradient(168deg, #ffffff 0%, #f3fdf7 45%, #ffffff 100%);
}

.deadline-hint {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.plan-create-sticky-bar {
  position: relative;
  z-index: 50;
  padding-top: env(safe-area-inset-top, 0px);
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.97) 0%,
    rgba(244, 252, 247, 0.92) 55%,
    rgba(255, 255, 255, 0.94) 100%
  );
  backdrop-filter: blur(16px) saturate(1.15);
  -webkit-backdrop-filter: blur(16px) saturate(1.15);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.85) inset,
    0 10px 32px -22px rgba(18, 74, 49, 0.28),
    0 0 40px -24px rgba(53, 205, 117, 0.12);
}

.create-action-dock {
  position: relative;
  z-index: 30;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  border-top: 1px solid rgba(15, 139, 78, 0.18);
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.97) 0%,
    rgba(240, 250, 244, 0.96) 100%
  );
  box-shadow:
    0 -14px 40px -18px rgba(18, 74, 49, 0.28),
    0 -1px 0 rgba(255, 255, 255, 0.85) inset,
    0 0 48px -20px rgba(53, 205, 117, 0.15);
  backdrop-filter: blur(16px) saturate(1.12);
  -webkit-backdrop-filter: blur(16px) saturate(1.12);
}

.create-action-dock__submit {
  position: relative;
  overflow: hidden;
}

@media (prefers-reduced-motion: no-preference) {
  .create-action-dock__submit::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      105deg,
      transparent 0%,
      transparent 40%,
      rgba(255, 255, 255, 0.45) 50%,
      transparent 60%,
      transparent 100%
    );
    transform: translateX(-100%);
    animation: plan-create-dock-shine 3.2s ease-in-out infinite;
    pointer-events: none;
  }
}

@keyframes plan-create-dock-shine {
  0%,
  35% {
    transform: translateX(-100%);
  }
  60%,
  100% {
    transform: translateX(100%);
  }
}

.optional-advanced-toggle {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-radius: 0.85rem;
  border: none;
  background: transparent;
  padding: 0.75rem 0.85rem 0.75rem 1rem;
  text-align: left;
  cursor: pointer;
  transition: background 0.18s ease;
}

.optional-advanced-toggle:hover {
  background: rgba(13, 143, 75, 0.06);
}

.optional-advanced-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: #1f2d27;
  letter-spacing: -0.02em;
}

.optional-advanced-subtitle {
  font-size: 0.75rem;
  font-weight: 500;
  color: #6f7e76;
}

.optional-advanced-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: rgba(13, 143, 75, 0.12);
  padding: 0.15rem 0.55rem;
  font-size: 0.68rem;
  font-weight: 700;
  color: #0b7d45;
}

.optional-advanced-chevron {
  flex-shrink: 0;
  font-size: 0.55rem;
  color: #0f8b4e;
  transition: transform 0.22s ease;
}

.optional-advanced-chevron.is-open {
  transform: rotate(180deg);
}

.form-control-input,
.form-control-textarea,
.form-control-number {
  width: 100%;
  box-sizing: border-box;
  border-radius: 0.85rem;
  border: 1px solid rgba(27, 111, 73, 0.16);
  background: linear-gradient(180deg, #ffffff 0%, #fafdfb 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    0 2px 10px rgba(18, 74, 49, 0.05);
  color: #111813;
  transition:
    border-color 0.2s ease,
    box-shadow 0.22s ease;
}

.form-control-input:hover,
.form-control-textarea:hover,
.form-control-number:hover {
  border-color: rgba(13, 139, 78, 0.28);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.95),
    0 4px 14px rgba(18, 74, 49, 0.07);
}

.form-control-input:focus,
.form-control-textarea:focus,
.form-control-number:focus {
  outline: none;
  border-color: rgba(15, 139, 78, 0.55);
  box-shadow:
    0 0 0 3px rgba(15, 139, 78, 0.14),
    0 4px 16px rgba(18, 74, 49, 0.08);
}

.form-control-input::placeholder,
.form-control-textarea::placeholder,
.form-control-number::placeholder {
  color: #8a9891;
}

.form-control-tagbox {
  border-radius: 0.85rem;
  border: 1px solid rgba(27, 111, 73, 0.16);
  background: linear-gradient(180deg, #ffffff 0%, #fafdfb 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    0 2px 10px rgba(18, 74, 49, 0.05);
  transition:
    border-color 0.2s ease,
    box-shadow 0.22s ease;
}

.form-control-tagbox:focus-within {
  border-color: rgba(15, 139, 78, 0.55);
  box-shadow:
    0 0 0 3px rgba(15, 139, 78, 0.14),
    0 4px 16px rgba(18, 74, 49, 0.08);
}

.form-control-file {
  width: 100%;
  box-sizing: border-box;
  border-radius: 0.85rem;
  border: 1px dashed rgba(27, 111, 73, 0.28);
  background: linear-gradient(180deg, #fcfefc 0%, #f5faf7 100%);
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease;
}

.form-control-file:hover {
  border-color: rgba(15, 139, 78, 0.45);
  background: linear-gradient(180deg, #ffffff 0%, #f3faf6 100%);
}

.plan-date-shell :deep(.el-date-editor.el-input),
.plan-date-shell :deep(.el-date-editor) {
  width: 100%;
}

.plan-date-shell :deep(.el-input__wrapper) {
  min-height: 44px;
  border-radius: 0.85rem;
  border: 1px solid rgba(27, 111, 73, 0.16);
  background: linear-gradient(180deg, #ffffff 0%, #fafdfb 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    0 2px 10px rgba(18, 74, 49, 0.05);
  transition:
    border-color 0.2s ease,
    box-shadow 0.22s ease;
}

.plan-date-shell :deep(.el-input__wrapper.is-focus) {
  border-color: rgba(15, 139, 78, 0.55);
  box-shadow:
    0 0 0 3px rgba(15, 139, 78, 0.14),
    0 4px 16px rgba(18, 74, 49, 0.08);
}

.plan-create-date-picker {
  width: 100%;
}

.bg-grid {
  background-image:
    linear-gradient(rgba(16, 84, 54, 0.085) 1px, transparent 1px),
    linear-gradient(90deg, rgba(16, 84, 54, 0.085) 1px, transparent 1px);
  background-size: 44px 44px;
  opacity: 0.45;
}

@media (prefers-reduced-motion: no-preference) {
  .bg-grid {
    animation: plan-create-grid-drift 48s linear infinite;
  }
}

@keyframes plan-create-grid-drift {
  0% {
    background-position:
      0 0,
      0 0;
  }
  100% {
    background-position:
      44px 44px,
      44px 44px;
  }
}

.bg-orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(46px);
  opacity: 0.52;
  will-change: transform;
}

@media (prefers-reduced-motion: no-preference) {
  .bg-orb-left {
    animation: plan-create-orb-float-a 14s ease-in-out infinite;
  }

  .bg-orb-right {
    animation: plan-create-orb-float-b 18s ease-in-out infinite;
  }

  .bg-orb-bottom {
    animation: plan-create-orb-float-c 20s ease-in-out infinite;
  }
}

.bg-orb-left {
  top: -90px;
  left: -60px;
  height: 280px;
  width: 280px;
  background: radial-gradient(
    circle at 30% 30%,
    rgba(53, 205, 117, 0.62),
    rgba(53, 205, 117, 0)
  );
}

.bg-orb-right {
  top: 120px;
  right: -80px;
  height: 320px;
  width: 320px;
  background: radial-gradient(
    circle at 50% 50%,
    rgba(123, 208, 168, 0.55),
    rgba(100, 200, 150, 0)
  );
}

.bg-orb-bottom {
  bottom: -120px;
  left: 20%;
  height: 300px;
  width: 440px;
  background: radial-gradient(
    circle at 50% 50%,
    rgba(185, 226, 206, 0.52),
    rgba(53, 205, 117, 0)
  );
}

@keyframes plan-create-orb-float-a {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  50% {
    transform: translate(18px, 12px) scale(1.06);
  }
}

@keyframes plan-create-orb-float-b {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  50% {
    transform: translate(-22px, 16px) scale(1.05);
  }
}

@keyframes plan-create-orb-float-c {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  50% {
    transform: translate(12px, -14px) scale(1.04);
  }
}

.back-nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 999px;
  border: 1px solid rgba(27, 111, 73, 0.2);
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.88),
    rgba(241, 249, 245, 0.92)
  );
  padding: 0.36rem 0.72rem 0.36rem 0.42rem;
  color: #1d3c2f;
  font-size: 0.78rem;
  font-weight: 700;
  box-shadow: 0 10px 20px -18px rgba(18, 74, 49, 0.45);
  transition:
    transform 160ms ease,
    box-shadow 180ms ease,
    border-color 180ms ease;
}

.back-nav-btn:hover {
  transform: translateX(-2px);
  border-color: rgba(27, 111, 73, 0.4);
  box-shadow: 0 12px 24px -16px rgba(18, 74, 49, 0.48);
}

.back-nav-icon {
  display: inline-flex;
  height: 1.5rem;
  width: 1.5rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(13, 143, 75, 0.14);
  color: #0f8b4e;
  font-size: 0.85rem;
}

.back-nav-text {
  line-height: 1;
}

.pro-chat-window {
  max-height: 22rem;
  overflow-y: auto;
  border-radius: 0.9rem;
  border: 1px solid #dce8e1;
  background: #f9fcfa;
  padding: 0.75rem;
}

.pro-chat-message {
  margin-bottom: 0.65rem;
  max-width: 86%;
  border-radius: 0.85rem;
  padding: 0.55rem 0.7rem;
}

.pro-chat-message:last-child {
  margin-bottom: 0;
}

.pro-chat-message.is-assistant {
  border: 1px solid #d2e5d9;
  background: #eff8f3;
}

.pro-chat-message.is-user {
  margin-left: auto;
  border: 1px solid #d6dce7;
  background: #ffffff;
}

.pro-chat-message.is-draft-streaming {
  max-width: 100%;
}

.pro-chat-role {
  margin-bottom: 0.3rem;
  font-size: 0.68rem;
  font-weight: 700;
  color: #60706a;
}

.pro-chat-content {
  white-space: pre-wrap;
  font-size: 0.82rem;
  line-height: 1.5;
  color: #1e2c25;
}

.plan-assistant-markdown {
  white-space: normal;
  word-break: break-word;
}

.plan-assistant-markdown :deep(p) {
  margin: 0.35em 0;
}

.plan-assistant-markdown :deep(p:first-child) {
  margin-top: 0;
}

.plan-assistant-markdown :deep(p:last-child) {
  margin-bottom: 0;
}

.plan-assistant-markdown :deep(ul),
.plan-assistant-markdown :deep(ol) {
  margin: 0.35em 0;
  padding-left: 1.25em;
}

.plan-assistant-markdown :deep(h1),
.plan-assistant-markdown :deep(h2),
.plan-assistant-markdown :deep(h3) {
  margin: 0.5em 0 0.25em;
  font-size: 0.95em;
  font-weight: 800;
  color: #14261c;
}

.plan-assistant-markdown :deep(pre) {
  margin: 0.4em 0;
  padding: 0.45em 0.55em;
  border-radius: 0.45rem;
  background: rgba(15, 139, 78, 0.06);
  font-size: 0.78em;
  overflow-x: auto;
}

.plan-assistant-markdown :deep(code) {
  font-size: 0.92em;
}

.pro-chat-thinking {
  margin-top: 0.7rem;
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid #d2e5d9;
  background: #eff8f3;
  padding: 0.35rem 0.6rem;
  font-size: 0.72rem;
  color: #4f655b;
}

.pro-chat-thinking .dot {
  margin-right: 0.25rem;
  height: 0.34rem;
  width: 0.34rem;
  border-radius: 999px;
  background: #7aa992;
  animation: dotPulse 1.2s infinite ease-in-out;
}

.pro-chat-thinking .dot:nth-child(2) {
  animation-delay: 120ms;
}

.pro-chat-thinking .dot:nth-child(3) {
  animation-delay: 240ms;
}

@keyframes dotPulse {
  0%,
  80%,
  100% {
    transform: scale(0.7);
    opacity: 0.55;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
