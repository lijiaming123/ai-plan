import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getApiBaseURL,
  getApiClient,
  HttpApiError,
  type PlanAssistantResult,
} from "../../../../lib/api-client";
import { consumePlanAssistantStream } from "../../../../lib/plan-assistant-stream";
import { storeDraftStreamPayload } from "../../../../lib/plan-assistant-stream";
import { trackEvent } from "../../../../lib/telemetry";
import { authState, refreshAuthBillingFromApi } from "../../../../stores/auth";
import { showEmbeddedPresetExamples } from "../../../../lib/feature-flags";
import type { PresetTemplateBrief } from "../../../../lib/api-client";
import {
  calcDurationDays,
  computeDeadlineByCycle,
  formatYmd,
  parseLocalDate,
  toIsoStartOfDay,
  type PlanCycleValue,
} from "../../../../lib/plan-dates";

type PlanMode = "basic" | "pro";
type CycleValue = PlanCycleValue;
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

export function usePlanCreate() {
const router = useRouter();
const route = useRoute();

type AssistantSchedule = {
  granularity: "day" | "week";
  slots: Array<{ slotKey: string; content: string }>;
};

const today = formatYmd(new Date());
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
const embeddedPresetBriefs = ref<PresetTemplateBrief[]>([]);
const embeddedPresetsLoading = ref(false);
const applyingEmbeddedPresetId = ref<string | null>(null);
const showEmbeddedPresets = computed(() => showEmbeddedPresetExamples());
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

function apiPlanTypeToScenario(type: string): PlanScenario {
  const t = String(type ?? "").trim().toLowerCase();
  if (t === "study") return "study";
  if (t === "travel") return "travel";
  return "other";
}

function applyDeadlineToForm(deadlineIso: string) {
  const day = deadlineIso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  form.cycle = "custom";
  form.customEndDate = day;
  if (form.planScenario === "travel") {
    form.travelEndDate = day;
  }
}

async function loadEmbeddedPresets() {
  if (!showEmbeddedPresets.value) return;
  embeddedPresetsLoading.value = true;
  try {
    const res = await getApiClient().listPresets();
    embeddedPresetBriefs.value = res.items.slice(0, 6);
  } catch {
    embeddedPresetBriefs.value = [];
  } finally {
    embeddedPresetsLoading.value = false;
  }
}

async function applyEmbeddedPreset(presetId: string) {
  if (applyingEmbeddedPresetId.value) return;
  applyingEmbeddedPresetId.value = presetId;
  try {
    const detail = await getApiClient().getPresetTemplateDetail({ id: presetId });
    form.planScenario = apiPlanTypeToScenario(detail.preview.type);
    form.goal = detail.preview.goal;
    form.requirement = detail.preview.requirementExcerpt;
    const gm = detail.preview.granularityMode;
    if (gm === "smart" || gm === "deep" || gm === "rough") {
      form.granularityMode = gm;
    }
    applyDeadlineToForm(detail.preview.deadline);
    errors.planScenario = "";
    errors.goal = "";
    errors.requirement = "";
    errors.customEndDate = "";
  } catch (e) {
    errorToastMessage.value =
      e instanceof Error ? e.message : "没能加载该示例，请稍后再试";
  } finally {
    applyingEmbeddedPresetId.value = null;
  }
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
  return date.getTime() < parseLocalDate(today).getTime();
}

function disableBeforeStartDate(date: Date) {
  return date.getTime() < parseLocalDate(form.startDate).getTime();
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
  void loadEmbeddedPresets();
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

return {
    planAssistantMemoryLoaded,
    planAssistantMemoryDismissed,
    isSubmitting,
    showUpgradeHint,
    planTierMode,
    isProMode,
    uploadedPlanFileName,
    uploadedFileHint,
    chatInput,
    isAiThinking,
    assistantDraftStreamMessageId,
    planAssistantChatWindowRef,
    scrollPlanAssistantChatToBottom,
    errorToastMessage,
    embeddedPresetBriefs,
    embeddedPresetsLoading,
    applyingEmbeddedPresetId,
    showEmbeddedPresets,
    focusAreas,
    focusAreaInput,
    focusAreaHint,
    MAX_FOCUS_AREAS,
    basicOptionalExpanded,
    basicOptionalFilledCount,
    chatMessages,
    assistantSchedule,
    proDraftGenerated,
    proOptimizationConfirmed,
    proPendingContent,
    proPendingSchedule,
    proMeta,
    proSelectedOptionId,
    proCustomOptimization,
    proApplyLoading,
    selectProOptimizationOption,
    form,
    errors,
    scenarioOptions,
    startingPointOptionsMap,
    cycleOptions,
    timeInvestmentOptions,
    granularityOptions,
    travelCompanionOptions,
    travelBudgetOptions,
    travelStyleChipOptions,
    travelTransportChipOptions,
    isTravelScenario,
    isOtherScenario,
    normalizeCommaSeparatedTags,
    toggleCommaSeparatedTag,
    effectiveDeadline,
    buildTravelRequirementTemplate,
    recommendedMode,
    granularityHint,
    acceptedPlanFileTypes,
    startingPointOptions,
    normalizeFocusArea,
    addFocusArea,
    removeFocusArea,
    handleFocusAreaKeydown,
    handleFocusAreaBlur,
    closeErrorToast,
    showErrorToast,
    extractErrorMessage,
    aiQuotaSummaryText,
    resolveExecutablePlanRequirement,
    getCycleLabel,
    generatedPrompt,
    continuationParentPlanId,
    loadEmbeddedPresets,
    applyEmbeddedPreset,
    applyDeadlineToForm,
    validateForm,
    handleSubmit,
    buildAiDraftContent,
    handleGenerateAiDraft,
    confirmProOptimizationDefault,
    applyProOptionOrCustom,
    handleChatSend,
    handleChatInputKeydown,
    handlePlanFileChange,
    switchTierMode,
    goBack,
    disableBeforeToday,
    disableBeforeStartDate,
    planScenarioToApiPlanType,
  };
}
