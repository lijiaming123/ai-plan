import type { PlanAssistantResult } from "../../../../lib/api-client";
import {
  calcDurationDays,
  computeDeadlineByCycle,
  formatYmd,
  type PlanCycleValue,
} from "../../../../lib/plan-dates";

export type PlanMode = "basic" | "pro";
export type CycleValue = PlanCycleValue;
export type PlanScenario = "study" | "travel" | "other";
export type StartingPoint =
  | ""
  | "none"
  | "newbie"
  | "junior"
  | "intermediate"
  | "advanced";
export type GranularityMode = "smart" | "deep" | "rough";
export type ReminderMode = "standard" | "smart";
export type AiDepth = "basic" | "advanced";

export type AssistantSchedule = {
  granularity: "day" | "week";
  slots: Array<{ slotKey: string; content: string }>;
};

export type PlanCreateFormState = {
  planScenario: PlanScenario | "";
  goal: string;
  requirement: string;
  startingPoint: StartingPoint;
  startDate: string;
  cycle: CycleValue;
  customEndDate: string;
  preference: string;
  timeInvestment: string;
  timeInvestmentCustomHours: string;
  granularityMode: GranularityMode;
  reminderMode: ReminderMode;
  aiDepth: AiDepth;
  travelFrom: string;
  travelTo: string;
  travelEndDate: string;
  travelCompanions: string;
  travelStyles: string;
  travelBudget: string;
  travelTransport: string;
  travelConstraints: string;
};

export const scenarioOptions = [
  { label: "学习", value: "study" },
  { label: "旅游", value: "travel" },
  { label: "其它", value: "other" },
] as const;

export function planScenarioToApiPlanType(
  scenario: PlanScenario | "",
): "general" | "study" | "travel" {
  if (scenario === "study") return "study";
  if (scenario === "travel") return "travel";
  return "general";
}

export function apiPlanTypeToScenario(type: string): PlanScenario {
  const t = String(type ?? "").trim().toLowerCase();
  if (t === "study") return "study";
  if (t === "travel") return "travel";
  return "other";
}

export function getCycleLabel(cycle: CycleValue) {
  const cycleLabelMap: Record<CycleValue, string> = {
    "1w": "1周",
    "1m": "1个月",
    "3m": "3个月",
    "6m": "半年",
    custom: "自定义",
  };
  return cycleLabelMap[cycle];
}

export function buildTravelRequirementTemplate(
  form: PlanCreateFormState,
  today: string,
) {
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

export function attachScheduleJsonToRequirement(
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

export function normalizedPendingScheduleFromAssistant(
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

export function resolveExecutablePlanRequirement(params: {
  form: PlanCreateFormState;
  proPendingContent: string | null;
  isTravelScenario: boolean;
  today: string;
}): string {
  const { form, proPendingContent, isTravelScenario, today } = params;
  const userNotes = form.requirement.trim();
  const aiDraft = proPendingContent?.trim() ?? "";
  if (isTravelScenario) {
    const travelTemplate = buildTravelRequirementTemplate(form, today);
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

export function buildGeneratedPrompt(params: {
  form: PlanCreateFormState;
  focusAreas: string[];
  effectiveDeadline: string;
  isTravelScenario: boolean;
  today: string;
}): string {
  const { form, focusAreas, effectiveDeadline, isTravelScenario, today } = params;
  if (isTravelScenario) {
    const travelTemplate = buildTravelRequirementTemplate(form, today);
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

  const endDateText = effectiveDeadline || form.startDate || today;
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
  if (focusAreas.length)
    contextLines.push(`- 重点倾斜/薄弱项：${focusAreas.join("、")}`);
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
}

export function buildAiDraftContent(params: {
  form: PlanCreateFormState;
  effectiveDeadline: string;
}) {
  const { form, effectiveDeadline } = params;
  const cycleLabel = getCycleLabel(form.cycle);
  const endDateText = effectiveDeadline || "待确认";
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
