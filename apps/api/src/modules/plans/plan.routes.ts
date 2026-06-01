/**
 * 计划域 HTTP 路由注册。
 *
 * 结构：
 * - 前半：请求体校验器（normalizeBody 支持误传 JSON 字符串）、AI 相关辅助（tryDeepseekAssistant、formatDraftToText）。
 * - registerPlanRoutes：REST + SSE；所有写操作除 PATCH 外多要求 JWT user。
 * - assistant-draft-stream / regenerate-stream：SSE 事件 JSON：`delta_text`（仅正文）| 兼容旧 `delta`；
 *   `body_complete`（正文展示已结束，进入 JSON/协议区，供前端出打卡表骨架）；`done` | `error`。
 *   落库仍写入完整模型输出（含 schedule 代码块）。
 * - parse-file：mammoth 解析 docx，文本类直接 utf8；限制扩展名防任意文件上传滥用。
 *
 * profile（创建计划时的扩展字段）：校验宽松，缺失或形状不对时忽略，保证老客户端仍能创建。
 */
import { PassThrough } from "node:stream";
import type { FastifyBaseLogger, FastifyInstance, FastifyReply } from "fastify";
import {
  archivePlan,
  compareDraftVersions,
  confirmPlanVersion,
  createGeneratedPlan,
  patchConfirmedPlan,
  getPlanDraft,
  getPlanWithDraft,
  listArchivedPlansForUser,
  listTrashPlans,
  listPlansForUser,
  unarchivePlan,
  parseRegenerateFallbackFromBaseRequirement,
  persistRegenerateVersionFromStreamOutput,
  prepareRegeneratePlanStream,
  regeneratePlanVersion,
  REGENERATE_PLAN_SYSTEM,
  restorePlan,
  softDeletePlan,
  swapPlanScheduleSlotContent,
  updatePlanScheduleSlot,
  updatePlanV1Requirement,
} from "./plan.service";
import {
  buildFallbackSchedule,
  extractLastJsonCodeBlock,
  parseScheduleWireOrNull,
  stripLastJsonCodeBlock,
  validateScheduleStrict,
} from "./deepseek-schedule";
import { createDraftStreamSplitter } from "./draft-stream-split";
import type { CheckinPublicReview } from "./checkin-submission-score.service";
import {
  createScheduleSlotAppeal,
  withdrawScheduleSlotAppeal,
} from "./schedule-slot-appeal.service";
import {
  closeLatestScheduleSlotCheckin,
  createScheduleSlotCheckin,
} from "./schedule-slot-checkin.service";
import {
  buildScheduleSlotKeys,
  decideScheduleGranularity,
} from "./plan.service";
import {
  completeDeepseekChat,
  isDeepseekConfigured,
  streamDeepseekChat,
} from "../../lib/deepseek";
import { generatePlanDraft } from "@ai-plan/ai-engine/client";
import mammoth from "mammoth";
import { runProPlanAgent } from "@ai-plan/pro-plan-agent";
import { buildPlanAssistantCacheKey } from "./assistant-cache-key";
import { createLlmRouter } from "../../lib/llm/llm-router";
import { createDeepseekProvider } from "../../lib/llm/providers/deepseek-provider";
import { prisma } from "../../lib/prisma";
import {
  reserveOnePlanAiQuotaUnit,
  userMayUsePlanProAgentFeatures,
} from "../billing/ai-quota.service";
import { buildPlanAssistantMemoryBlock } from "../me/plan-assistant-context.service";

const planTypes = ["general", "study", "work", "travel"] as const;
const planModes = ["basic", "pro"] as const;
const levels = [
  "none",
  "newbie",
  "junior",
  "intermediate",
  "advanced",
] as const;
const cycles = ["1w", "1m", "3m", "6m", "custom"] as const;
const outputModes = ["daily", "phase-weekly", "phase-monthly"] as const;
const aiDepths = ["basic", "advanced"] as const;
const reminderModes = ["standard", "smart"] as const;
const granularityModes = ["smart", "deep", "rough"] as const;

type PlanType = (typeof planTypes)[number];
type PlanMode = (typeof planModes)[number];
type Level = (typeof levels)[number];
type Cycle = (typeof cycles)[number];
type OutputMode = (typeof outputModes)[number];
type AiDepth = (typeof aiDepths)[number];
type ReminderMode = (typeof reminderModes)[number];
type GranularityMode = (typeof granularityModes)[number];
type AssistantMode = "draft" | "chat";

type PlanAssistantBody = {
  mode: AssistantMode;
  goal: string;
  requirement: string;
  startDate: string;
  cycle: Cycle;
  endDate: string;
  granularityMode?: GranularityMode;
  message?: string;
};

type PlanAssistantStreamBody = PlanAssistantBody & {
  tier?: "basic" | "pro";
  agent?: "basic" | "pro";
};

type AssistantApplyOptionBody = {
  baseSuggestedContent: string;
  baseSchedule: {
    granularity: "day" | "week";
    slots: Array<{ slotKey: string; content: string }>;
  };
  optionId?: "more_granular" | "save_time" | "more_steady" | "more_aggressive";
  customText?: string;
  context: {
    goal: string;
    startDate: string;
    endDate: string;
    cycle: Cycle;
    type: PlanType;
  };
};

type ParsePlanFileBody = {
  fileName: string;
  contentBase64: string;
};

/** Pro 评审后给前端的 3 条精炼行动清单（流式 meta_ready 与非流式 /plans/assistant 共用） */
function buildProAssistantAdviceText(
  scoreTotal: number,
  issues: Array<{ title: string; suggestion: string }>,
): string {
  const topIssue = issues[0];
  return [
    `1) 先看评分：${scoreTotal}（越高越可执行）。`,
    `2) 先修一个最关键问题：${topIssue ? `${topIssue.title} — ${topIssue.suggestion}` : "当前结构已可执行，重点是把证据/验收写清楚。"}`,
    `3) 选一个方向微调：从下方选项里选 1 个（更细/更省时/更稳/更激进），或直接点「使用默认优化版（确认）」。`,
  ].join("\n");
}

type ConfirmPlanVersionBody = {
  version: number;
};

type CreatePlanBody = {
  goal: string;
  deadline: string;
  requirement: string;
  type: PlanType;
  /** 可选：续航来源已定稿计划 id */
  parentPlanId?: string;
  profile?: {
    planMode: PlanMode;
    basicInfo: {
      planName: string;
      planContent: string;
      currentLevel: Level;
      startDate: string;
      cycle: Cycle;
      endDate: string;
      preference: string;
      timeInvestment: string;
      outputMode: OutputMode;
      granularityMode?: GranularityMode;
    };
    proSettings?: {
      aiDepth: AiDepth;
      reminderMode: ReminderMode;
    };
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeBody(raw: unknown) {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function parseLastReviewFromBody(raw: unknown): CheckinPublicReview | undefined {
  if (!isRecord(raw)) return undefined;
  if (typeof raw.summary !== "string") return undefined;
  if (!Array.isArray(raw.dimensions)) return undefined;
  return raw as CheckinPublicReview;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isDateString(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function isOneOf<T extends readonly string[]>(
  value: unknown,
  values: T,
): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

function validateCreatePlanBody(
  raw: unknown,
): { ok: true; data: CreatePlanBody } | { ok: false; message: string } {
  raw = normalizeBody(raw);
  if (!isRecord(raw)) return { ok: false, message: "Invalid request body" };

  if (!isNonEmptyString(raw.goal))
    return { ok: false, message: "goal is required" };
  if (!isNonEmptyString(raw.requirement))
    return { ok: false, message: "requirement is required" };
  if (!isDateString(raw.deadline))
    return { ok: false, message: "deadline must be a valid date string" };
  if (!isOneOf(raw.type, planTypes))
    return { ok: false, message: "type is invalid" };
  if ("parentPlanId" in raw && raw.parentPlanId != null) {
    if (typeof raw.parentPlanId !== "string" || !raw.parentPlanId.trim()) {
      return { ok: false, message: "parentPlanId 无效" };
    }
  }
  // profile is optional metadata for enhanced generation experience.
  // To keep /plans creation highly available across client versions,
  // profile shape mismatches will be tolerated and ignored by route logic.

  return { ok: true, data: raw as CreatePlanBody };
}

function validateAssistantBody(
  raw: unknown,
): { ok: true; data: PlanAssistantBody } | { ok: false; message: string } {
  raw = normalizeBody(raw);
  if (!isRecord(raw)) return { ok: false, message: "Invalid request body" };
  if (!isOneOf(raw.mode, ["draft", "chat"] as const))
    return { ok: false, message: "mode is invalid" };
  if (!isNonEmptyString(raw.goal))
    return { ok: false, message: "goal is required" };
  if (typeof raw.requirement !== "string")
    return { ok: false, message: "requirement must be a string" };
  if (!isDateString(raw.startDate))
    return { ok: false, message: "startDate must be a valid date string" };
  if (!isOneOf(raw.cycle, cycles))
    return { ok: false, message: "cycle is invalid" };
  if (!isDateString(raw.endDate))
    return { ok: false, message: "endDate must be a valid date string" };
  if (raw.mode === "chat" && !isNonEmptyString(raw.message))
    return { ok: false, message: "message is required in chat mode" };
  if (
    raw.cycle === "custom" &&
    new Date(raw.endDate).getTime() < new Date(raw.startDate).getTime()
  ) {
    return {
      ok: false,
      message: "endDate must be >= startDate for custom cycle",
    };
  }
  if (
    isRecord(raw) &&
    raw.granularityMode != null &&
    !isOneOf(raw.granularityMode, granularityModes)
  ) {
    return { ok: false, message: "granularityMode is invalid" };
  }
  return { ok: true, data: raw as PlanAssistantBody };
}

function validateAssistantStreamBody(
  raw: unknown,
):
  | { ok: true; data: PlanAssistantStreamBody }
  | { ok: false; message: string } {
  // 复用 assistant 校验；tier/agent 宽松容忍
  const base = validateAssistantBody(raw);
  if (!base.ok) return base;
  const o = normalizeBody(raw);
  if (!isRecord(o)) return base;
  const tier = (o as any).tier;
  const agent = (o as any).agent;
  if (tier != null && tier !== "basic" && tier !== "pro") {
    return { ok: false, message: "tier is invalid" };
  }
  if (agent != null && agent !== "basic" && agent !== "pro") {
    return { ok: false, message: "agent is invalid" };
  }
  return { ok: true, data: o as PlanAssistantStreamBody };
}

function validateAssistantApplyOptionBody(
  raw: unknown,
):
  | { ok: true; data: AssistantApplyOptionBody }
  | { ok: false; message: string } {
  raw = normalizeBody(raw);
  if (!isRecord(raw)) return { ok: false, message: "Invalid request body" };
  if (!isNonEmptyString(raw.baseSuggestedContent))
    return { ok: false, message: "baseSuggestedContent is required" };
  if (!isRecord(raw.baseSchedule))
    return { ok: false, message: "baseSchedule is required" };
  const g = (raw.baseSchedule as any).granularity;
  if (g !== "day" && g !== "week")
    return { ok: false, message: "baseSchedule.granularity is invalid" };
  const slots = (raw.baseSchedule as any).slots;
  if (!Array.isArray(slots) || slots.length < 1)
    return { ok: false, message: "baseSchedule.slots is required" };
  for (const s of slots) {
    if (!s || typeof s !== "object")
      return { ok: false, message: "baseSchedule.slots is invalid" };
    if (!isNonEmptyString((s as any).slotKey))
      return { ok: false, message: "baseSchedule.slots.slotKey is required" };
    if (!isNonEmptyString((s as any).content))
      return { ok: false, message: "baseSchedule.slots.content is required" };
  }
  if (raw.optionId != null) {
    const ok = [
      "more_granular",
      "save_time",
      "more_steady",
      "more_aggressive",
    ].includes(String(raw.optionId));
    if (!ok) return { ok: false, message: "optionId is invalid" };
  }
  if (raw.customText != null && typeof raw.customText !== "string")
    return { ok: false, message: "customText must be a string" };
  if (!isRecord(raw.context))
    return { ok: false, message: "context is required" };
  if (!isNonEmptyString((raw.context as any).goal))
    return { ok: false, message: "context.goal is required" };
  if (!isDateString((raw.context as any).startDate))
    return {
      ok: false,
      message: "context.startDate must be a valid date string",
    };
  if (!isDateString((raw.context as any).endDate))
    return {
      ok: false,
      message: "context.endDate must be a valid date string",
    };
  if (!isOneOf((raw.context as any).cycle, cycles))
    return { ok: false, message: "context.cycle is invalid" };
  if (!isOneOf((raw.context as any).type, planTypes))
    return { ok: false, message: "context.type is invalid" };
  return { ok: true, data: raw as AssistantApplyOptionBody };
}

type AssistantDraftStreamBody = {
  assistantPrompt: string;
  startDate: string;
  cycle: Cycle;
  endDate: string;
};

function validateAssistantDraftStreamBody(
  raw: unknown,
):
  | { ok: true; data: AssistantDraftStreamBody }
  | { ok: false; message: string } {
  raw = normalizeBody(raw);
  if (!isRecord(raw)) return { ok: false, message: "Invalid request body" };
  if (typeof raw.assistantPrompt !== "string")
    return { ok: false, message: "assistantPrompt must be a string" };
  if (!raw.assistantPrompt.trim())
    return { ok: false, message: "assistantPrompt is required" };
  if (raw.assistantPrompt.length > 120_000)
    return { ok: false, message: "assistantPrompt is too large" };
  if (!isDateString(raw.startDate))
    return { ok: false, message: "startDate must be a valid date string" };
  if (!isOneOf(raw.cycle, cycles))
    return { ok: false, message: "cycle is invalid" };
  if (!isDateString(raw.endDate))
    return { ok: false, message: "endDate must be a valid date string" };
  if (
    raw.cycle === "custom" &&
    new Date(raw.endDate).getTime() < new Date(raw.startDate).getTime()
  ) {
    return {
      ok: false,
      message: "endDate must be >= startDate for custom cycle",
    };
  }
  return {
    ok: true,
    data: {
      assistantPrompt: raw.assistantPrompt,
      startDate: raw.startDate,
      cycle: raw.cycle,
      endDate: raw.endDate,
    },
  };
}

function validateParsePlanFileBody(
  raw: unknown,
): { ok: true; data: ParsePlanFileBody } | { ok: false; message: string } {
  raw = normalizeBody(raw);
  if (!isRecord(raw)) return { ok: false, message: "Invalid request body" };
  if (!isNonEmptyString(raw.fileName))
    return { ok: false, message: "fileName is required" };
  if (!isNonEmptyString(raw.contentBase64))
    return { ok: false, message: "contentBase64 is required" };
  return { ok: true, data: raw as ParsePlanFileBody };
}

function validateConfirmPlanVersionBody(
  raw: unknown,
): { ok: true; data: ConfirmPlanVersionBody } | { ok: false; message: string } {
  raw = normalizeBody(raw);
  if (!isRecord(raw)) return { ok: false, message: "Invalid request body" };
  if (
    typeof raw.version !== "number" ||
    !Number.isInteger(raw.version) ||
    raw.version < 1
  ) {
    return { ok: false, message: "version must be a positive integer" };
  }
  return { ok: true, data: raw as ConfirmPlanVersionBody };
}

function getFileExtension(fileName: string) {
  const index = fileName.lastIndexOf(".");
  if (index < 0) return "";
  return fileName.slice(index + 1).toLowerCase();
}

function sanitizeTextContent(content: string) {
  return content
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

/** 与 /plans/assistant、流式 draft-stream 共用的人设 system prompt（中文输出、可落库的正文风格） */
const DEEPSEEK_SYSTEM =
  "你是「计划大师」的 AI 计划顾问。根据用户给出的信息与要求，用中文输出可直接作为「计划内容」保存的正文：务实用语、分阶段目标与验收、可执行任务（优先按周，必要时到天）、风险与应对、复盘建议。不要输出与计划无关的寒暄。";

const DEEPSEEK_SYSTEM_TRAVEL =
  "你是「旅行行程规划师」。根据用户给出的信息与要求，用中文输出可直接作为「行程攻略/行程安排」保存的正文：按天/按时段给出路线顺序、交通方式与通勤时长、预约/门票/营业时间提醒、备选方案与注意事项。不要用“完成任务/提交证明/产出”这类学习计划语气，也不要输出与行程无关的寒暄。";

const DEEPSEEK_SYSTEM_GENERAL =
  "你是「轻量行动清单教练」。根据用户给出的信息与要求，用中文输出可直接作为「行动清单/习惯计划」保存的正文：强调最小可执行动作、简单规则与复盘，不要要求上传证明/材料；完成方式默认是“勾选完成”，可选写一句备注。不要输出与清单无关的寒暄。";

const TRAVEL_SCHEDULE_INSTRUCTIONS = [
  "【行程化输出要求（仅适用于旅游/旅行类计划）】",
  "你正在生成的是“行程安排”，不是学习计划。每个 schedule slot.content 必须同时包含以下要素：",
  "1) 早/午/晚（或上午/下午/晚上）的路线顺序（地点/景点/餐饮/休息点按先后排列）；",
  "2) 交通方式 + 预计通勤时长（如地铁/公交/打车/步行/高铁/航班）；",
  "3) 预约/门票/营业时间/入园与排队等提醒（如需提前预约、建议到达时间）；",
  "4) 备选方案（如下雨/人多/临时关闭时替代点位或改线）；",
  "5) 可选记录建议（如拍照点/一句话记录/当日小结）。",
  "风格：攻略/行程规划，务实可执行；避免“完成任务/提交证明/学习产出/打卡证据”等措辞。",
].join("\n");

const GENERAL_SCHEDULE_INSTRUCTIONS = [
  "【轻量清单输出要求（仅适用于其它/通用/checkbox-only 计划）】",
  "你正在生成的是“轻量行动清单/习惯计划”，不是学习计划也不是旅行行程。",
  "每个 schedule slot.content 用 1-2 句中文描述“最小行动 + 可选加强动作（可省略）”。",
  "不要在 slot.content 或 checkinSpec 中要求上传证明/材料/附件/链接；默认完成方式是“勾选完成”，用户可选写一句备注。",
  "建议：避免过度规划，不要给太长的解释或方法论。",
].join("\n");

function isTravelLikeRequirementText(text: string): boolean {
  const t = (text ?? "").toLowerCase();
  if (!t.trim()) return false;
  if (/\btype\s*[:=]\s*travel\b/i.test(t)) return true;
  if (/\bplan\s*type\s*[:=]\s*travel\b/i.test(t)) return true;
  if (/\btravel\b/.test(t) && /(行程|旅行|旅游|攻略|出行|路线|景点|酒店|航班|高铁|车次|地铁|公交|通勤)/i.test(text))
    return true;
  return /(行程|旅行|旅游|攻略|出行|路线|景点|酒店|民宿|航班|高铁|车次|地铁|公交|步行|打车|门票|预约|营业时间|开放时间)/i.test(
    text,
  );
}

function sendPlanAiQuotaExceeded(
  reply: FastifyReply,
  q: Extract<Awaited<ReturnType<typeof reserveOnePlanAiQuotaUnit>>, { ok: false }>,
) {
  return reply.code(429).send({
    message: q.message,
    aiQuota: {
      used: q.used,
      limit: q.limit,
      yearMonth: q.yearMonth,
      tier: q.tier,
    },
  });
}

function isGeneralLikeRequirementText(text: string): boolean {
  const t = (text ?? "").toLowerCase();
  if (!t.trim()) return false;
  if (/\btype\s*[:=]\s*general\b/i.test(t)) return true;
  if (/\bplan\s*type\s*[:=]\s*general\b/i.test(t)) return true;
  if (/planScenario\"?\s*[:=]\s*\"?other\b/i.test(t)) return true;
  if (/场景\s*[:：]\s*(other|其它|通用)/i.test(text)) return true;
  if (/(其它|通用|清单|习惯|打卡|每日|最小行动)/i.test(text)) return true;
  return false;
}

/** 配置 DeepSeek 时走云端对话；失败则回退到本地模板文案，避免接口整体失败 */
async function tryDeepseekAssistant(
  log: FastifyBaseLogger,
  body: PlanAssistantBody,
  localDraftText: string,
  memoryPrefix = "",
): Promise<{
  reply: string;
  suggestedContent: string;
  schedule?: unknown;
} | null> {
  if (!isDeepseekConfigured()) return null;

  try {
    if (body.mode === "draft") {
      const effectiveMode: GranularityMode = isOneOf(
        body.granularityMode,
        granularityModes,
      )
        ? body.granularityMode
        : "smart";
      const startDateIso = new Date(
        `${body.startDate}T00:00:00.000Z`,
      ).toISOString();
      const endDateIso = new Date(
        `${body.endDate}T00:00:00.000Z`,
      ).toISOString();
      const expectedGranularity = decideScheduleGranularity({
        mode: effectiveMode,
        startDate: startDateIso,
        endDate: endDateIso,
      });
      const slotKeys = buildScheduleSlotKeys({
        granularity: expectedGranularity,
        startDate: startDateIso,
        endDate: endDateIso,
      });

      const baseRequirement =
        body.requirement.trim().length > 0
          ? body.requirement
          : `请根据以下目标生成计划：${body.goal}`;
      const travelLike = isTravelLikeRequirementText(baseRequirement);
      const generalLike = !travelLike && isGeneralLikeRequirementText(baseRequirement);
      const userContent = [
        ...(memoryPrefix.trim()
          ? [`${memoryPrefix.trim()}\n`, ""]
          : []),
        `目标：${body.goal}`,
        `起始：${body.startDate}，预计完成：${body.endDate}，周期代码：${body.cycle}`,
        "",
        `补充说明：`,
        baseRequirement,
        ...(travelLike
          ? ["", TRAVEL_SCHEDULE_INSTRUCTIONS]
          : generalLike
            ? ["", GENERAL_SCHEDULE_INSTRUCTIONS]
            : []),
        "",
        `请输出两部分：`,
        `1) 可直接保存为「计划内容」的中文正文；`,
        `2) 在最后输出一个严格的 JSON 代码块（\`\`\`json ...\`\`\`），仅包含如下结构：`,
        `{`,
        `  "schedule": {`,
        `    "granularity": "${expectedGranularity}",`,
        `    "slots": [`,
        `      { "slotKey": "...", "content": "...", "checkinSpec": { "criteria": ["..."], "evidenceHint": "..." } }`,
        `    ]`,
        `  }`,
        `}`,
        `注意：slotKey 必须严格来自下方「时间槽」列表，且顺序必须完全一致；content 为当期计划一段中文（1-3句，具体可执行）。可选 checkinSpec：criteria 为 2-5 条可验收短句，evidenceHint 提示应提交何种证明。`,
        "",
        "时间槽：",
        ...slotKeys.map((k) => `- ${k}`),
      ].join("\n");

      const deepseekRaw = await completeDeepseekChat([
        {
          role: "system",
          content: travelLike
            ? DEEPSEEK_SYSTEM_TRAVEL
            : generalLike
              ? DEEPSEEK_SYSTEM_GENERAL
              : DEEPSEEK_SYSTEM,
        },
        { role: "user", content: userContent },
      ]);
      const jsonBlock = extractLastJsonCodeBlock(deepseekRaw);
      const wire = jsonBlock ? parseScheduleWireOrNull(jsonBlock) : null;
      const validated = wire
        ? validateScheduleStrict({
            expectedGranularity,
            expectedSlotKeys: slotKeys,
            wire,
          })
        : ({ ok: false as const, reason: "missing json" } as const);
      const schedule = validated.ok
        ? validated.schedule
        : buildFallbackSchedule({ granularity: expectedGranularity, slotKeys });
      const suggestedContent = jsonBlock
        ? stripLastJsonCodeBlock(deepseekRaw)
        : deepseekRaw;
      return {
        reply:
          "已通过 DeepSeek 生成计划初稿，你可继续调整说明后再次提交或直接使用。",
        suggestedContent,
        schedule,
      };
    }

    const userContent = `${memoryPrefix.trim() ? `${memoryPrefix.trim()}\n\n` : ""}【当前计划内容】\n${body.requirement || "（暂无）"}\n\n【用户补充】\n${body.message}`;
    const suggestedContent = await completeDeepseekChat([
      {
        role: "system",
        content: `${DEEPSEEK_SYSTEM} 用户会提出补充，请输出合并、润色后的完整计划正文。`,
      },
      { role: "user", content: userContent },
    ]);
    return {
      reply: "已根据你的补充更新了计划内容（DeepSeek）。",
      suggestedContent,
    };
  } catch (err) {
    log.warn(
      { err },
      "DeepSeek plan assistant failed; falling back to local draft",
    );
    // 回退路径：仍提供 schedule（由 granularityMode + 起止日期骨架生成 + 默认文案填充）
    const effectiveMode: GranularityMode = isOneOf(
      body.granularityMode,
      granularityModes,
    )
      ? body.granularityMode
      : "smart";
    const startDateIso = new Date(
      `${body.startDate}T00:00:00.000Z`,
    ).toISOString();
    const endDateIso = new Date(`${body.endDate}T00:00:00.000Z`).toISOString();
    const expectedGranularity = decideScheduleGranularity({
      mode: effectiveMode,
      startDate: startDateIso,
      endDate: endDateIso,
    });
    const slotKeys = buildScheduleSlotKeys({
      granularity: expectedGranularity,
      startDate: startDateIso,
      endDate: endDateIso,
    });
    const schedule = buildFallbackSchedule({
      granularity: expectedGranularity,
      slotKeys,
    });
    return {
      reply:
        body.mode === "draft"
          ? "AI 服务暂时不可用，已使用本地模板生成初稿；配置 DEEPSEEK_API_KEY 后可启用云端生成。"
          : "AI 服务暂时不可用，已把你的补充直接合并进正文；可稍后重试。",
      suggestedContent:
        body.mode === "draft"
          ? localDraftText
          : `${body.requirement}\n\n用户补充：${body.message}`,
      schedule: body.mode === "draft" ? schedule : undefined,
    };
  }
}

/** 无 AI 时根据 ai-engine 本地草稿生成一段可读的「计划说明」纯文本 */
function formatDraftToText(params: {
  goal: string;
  startDate: string;
  endDate: string;
  cycle: Cycle;
  requirement: string;
}) {
  const draft = generatePlanDraft({
    goal: params.goal,
    deadline: new Date(`${params.endDate}T00:00:00.000Z`).toISOString(),
    requirement: params.requirement || "暂无补充说明",
    type: "general",
  });
  const stageLines = draft.stages
    .map((stage) => {
      const tasks = stage.tasks.map((task) => `  - ${task.title}`).join("\n");
      return `【${stage.sortOrder}. ${stage.name}】\n${tasks}`;
    })
    .join("\n\n");

  return [
    `目标：${params.goal}`,
    `起始时间：${params.startDate}`,
    `预计完成：${params.endDate}`,
    `周期：${params.cycle}`,
    "",
    stageLines,
  ].join("\n");
}

export async function registerPlanRoutes(fastify: FastifyInstance) {
  const requireLogin = async (request: any) => {
    // 仅要求是“已登录用户”（user/admin 均可）；handler 内直接读取 request.user.sub
    const payload = (await request.jwtVerify()) as { sub: string };
    // 兼容不同 fastify-jwt 版本：不一定会自动挂 request.user
    request.user = payload;
  };

  // —— CRUD 与草稿生命周期 ——
  fastify.get(
    "/plans",
    { preHandler: requireLogin },
    async (request, reply) => {
      const userId = request.user.sub;
      const q = request.query as { sort?: string };
      const raw = q.sort;
      if (
        raw != null &&
        raw !== "" &&
        raw !== "created" &&
        raw !== "deadline"
      ) {
        return reply
          .code(400)
          .send({ message: "Invalid sort; use created or deadline" });
      }
      const sort = raw === "deadline" ? "deadline_asc" : "created_desc";
      const plans = await listPlansForUser(userId, { sort });
      return reply.send({ plans });
    },
  );

  fastify.get(
    "/plans/trash",
    { preHandler: requireLogin },
    async (request, reply) => {
      const userId = request.user.sub;
      const plans = await listTrashPlans(userId);
      return reply.send({ plans });
    },
  );

  fastify.get(
    "/plans/archive",
    { preHandler: requireLogin },
    async (request, reply) => {
      const userId = request.user.sub;
      const q = request.query as {
        sort?: string;
        limit?: string;
        offset?: string;
        search?: string;
      };
      const raw = q.sort;
      if (
        raw != null &&
        raw !== "" &&
        raw !== "created" &&
        raw !== "deadline"
      ) {
        return reply
          .code(400)
          .send({ message: "Invalid sort; use created or deadline" });
      }
      const sort = raw === "deadline" ? "deadline_asc" : "created_desc";

      let limit = 20;
      if (q.limit != null && q.limit !== "") {
        const n = Number(q.limit);
        if (!Number.isInteger(n) || n < 1 || n > 50) {
          return reply
            .code(400)
            .send({ message: "Invalid limit; use integer 1-50" });
        }
        limit = n;
      }

      let offset = 0;
      if (q.offset != null && q.offset !== "") {
        const n = Number(q.offset);
        if (!Number.isInteger(n) || n < 0 || n > 10_000) {
          return reply.code(400).send({ message: "Invalid offset" });
        }
        offset = n;
      }

      let search: string | undefined;
      if (q.search != null && String(q.search).trim() !== "") {
        search = String(q.search).trim().slice(0, 120);
      }

      const result = await listArchivedPlansForUser(userId, {
        sort,
        limit,
        offset,
        search,
      });
      return reply.send(result);
    },
  );

  fastify.delete(
    "/plans/:id",
    { preHandler: requireLogin },
    async (request, reply) => {
      const userId = request.user.sub;
      const { id } = request.params as { id: string };
      const result = await softDeletePlan({ planId: id, userId });
      if (!result.ok)
        return reply.code(result.code).send({ message: result.message });
      return reply.send({ ok: true });
    },
  );

  fastify.post(
    "/plans/:id/restore",
    { preHandler: requireLogin },
    async (request, reply) => {
      const userId = request.user.sub;
      const { id } = request.params as { id: string };
      const result = await restorePlan({ planId: id, userId });
      if (!result.ok)
        return reply.code(result.code).send({ message: result.message });
      return reply.send({ ok: true });
    },
  );

  fastify.post(
    "/plans/:id/archive",
    { preHandler: requireLogin },
    async (request, reply) => {
      const userId = request.user.sub;
      const { id } = request.params as { id: string };
      const result = await archivePlan({ planId: id, userId });
      if (!result.ok)
        return reply.code(result.code).send({ message: result.message });
      return reply.send({ ok: true });
    },
  );

  fastify.post(
    "/plans/:id/unarchive",
    { preHandler: requireLogin },
    async (request, reply) => {
      const userId = request.user.sub;
      const { id } = request.params as { id: string };
      const result = await unarchivePlan({ planId: id, userId });
      if (!result.ok)
        return reply.code(result.code).send({ message: result.message });
      return reply.send({ ok: true });
    },
  );

  fastify.post(
    "/plans",
    { preHandler: fastify.requireRole("user") },
    async (request, reply) => {
      const parsed = validateCreatePlanBody(request.body);
      if (!parsed.ok) {
        return reply.code(400).send({ message: parsed.message });
      }

      const body = parsed.data;
      const payload = await request.jwtVerify<{ sub: string }>();
      const parentPid = body.parentPlanId?.trim();
      if (parentPid) {
        const parent = await prisma.plan.findFirst({
          where: { id: parentPid, userId: payload.sub, deletedAt: null },
        });
        if (!parent) {
          return reply.code(404).send({ message: "父计划不存在或不可访问" });
        }
      }
      const granularityMode = isOneOf(
        body.profile?.basicInfo?.granularityMode,
        granularityModes,
      )
        ? body.profile?.basicInfo?.granularityMode
        : undefined;
      const startDateIso = body.profile?.basicInfo?.startDate
        ? new Date(
            `${body.profile.basicInfo.startDate}T00:00:00.000Z`,
          ).toISOString()
        : body.deadline;
      const plan = await createGeneratedPlan({
        userId: payload.sub,
        goal: body.goal,
        deadline: body.deadline,
        requirement: body.requirement,
        type: body.type,
        granularityMode,
        startDateIso,
        parentPlanId: parentPid ?? undefined,
      });

      return reply.code(201).send(plan);
    },
  );

  fastify.patch(
    "/plans/:id",
    { preHandler: fastify.requireRole("user") },
    async (request, reply) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      const { id } = request.params as { id: string };
      const raw = normalizeBody(request.body);
      const patch = isRecord(raw) ? raw : {};
      const result = await patchConfirmedPlan({
        planId: id,
        userId: payload.sub,
        patch,
      });
      if (!result.ok)
        return reply.code(result.code).send({ message: result.message });
      return reply.send({ nextStep: result.nextStep });
    },
  );

  fastify.patch(
    "/plans/:id/schedule/slots/:slotKey",
    { preHandler: fastify.requireRole("user") },
    async (request, reply) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      const { id, slotKey } = request.params as { id: string; slotKey: string };
      const idempotencyKeyRaw = String(
        request.headers["idempotency-key"] ?? request.headers["Idempotency-Key"] ?? "",
      ).trim();
      const idempotencyKey = idempotencyKeyRaw.length ? idempotencyKeyRaw : undefined;
      const body = normalizeBody(request.body);
      const content =
        isRecord(body) && typeof body.content === "string"
          ? body.content
          : undefined;
      const restore = isRecord(body) && body.restore === true;
      const planVersion =
        isRecord(body) &&
        typeof body.version === "number" &&
        Number.isInteger(body.version) &&
        body.version >= 1
          ? body.version
          : undefined;
      const result = await updatePlanScheduleSlot({
        planId: id,
        userId: payload.sub,
        slotKey,
        content,
        restore,
        planVersion,
      });
      if (!result.ok)
        return reply.code(result.code).send({ message: result.message });
      return reply.send({ schedule: result.schedule, slot: result.slot });
    },
  );

  fastify.post(
    "/plans/:id/schedule/slots/swap-content",
    { preHandler: fastify.requireRole("user") },
    async (request, reply) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      const { id } = request.params as { id: string };
      const body = normalizeBody(request.body);
      const slotKeyA =
        isRecord(body) && typeof body.slotKeyA === "string"
          ? body.slotKeyA
          : "";
      const slotKeyB =
        isRecord(body) && typeof body.slotKeyB === "string"
          ? body.slotKeyB
          : "";
      const rawVersion =
        isRecord(body) && "version" in body ? body.version : undefined;
      const hasVersion = rawVersion !== undefined;
      const versionIsValid =
        typeof rawVersion === "number" &&
        Number.isInteger(rawVersion) &&
        rawVersion >= 1;
      if (hasVersion && !versionIsValid) {
        return reply
          .code(400)
          .send({ message: "version must be a positive integer" });
      }
      const planVersion = versionIsValid ? rawVersion : undefined;

      const result = await swapPlanScheduleSlotContent({
        planId: id,
        userId: payload.sub,
        slotKeyA,
        slotKeyB,
        planVersion,
      });
      if (!result.ok)
        return reply.code(result.code).send({ message: result.message });
      return reply.send({ schedule: result.schedule, slots: result.slots });
    },
  );

  fastify.post(
    "/plans/:id/schedule/slots/:slotKey/checkins",
    { preHandler: fastify.requireRole("user") },
    async (request, reply) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      const { id, slotKey } = request.params as { id: string; slotKey: string };
      const idempotencyKeyRaw = String(
        request.headers["idempotency-key"] ??
          request.headers["Idempotency-Key"] ??
          "",
      ).trim();
      const idempotencyKey = idempotencyKeyRaw.length
        ? idempotencyKeyRaw
        : undefined;
      const body = normalizeBody(request.body);
      const content =
        isRecord(body) && typeof body.content === "string"
          ? body.content
          : undefined;
      const rawAtt =
        isRecord(body) && Array.isArray(body.attachments)
          ? (body.attachments as unknown[])
          : [];
      const attachments = rawAtt
        .filter((x): x is Record<string, unknown> => isRecord(x))
        .map((x) => ({
          url: typeof x.url === "string" ? x.url : "",
          fileName: typeof x.fileName === "string" ? x.fileName : undefined,
          kind: typeof x.kind === "string" ? x.kind : undefined,
        }));
      const result = await createScheduleSlotCheckin({
        planId: id,
        userId: payload.sub,
        slotKey,
        content,
        attachments,
        idempotencyKey,
      });
      if (!result.ok) {
        if (result.code === 422) {
          return reply.code(422).send({
            message: result.message,
            code: "CHECKIN_NOT_PASSED",
            review: result.review,
          });
        }
        return reply.code(result.code).send({ message: result.message });
      }
      return reply.code(201).send({ submission: result.submission });
    },
  );

  fastify.delete(
    "/plans/:id/schedule/slots/:slotKey/checkins",
    { preHandler: fastify.requireRole("user") },
    async (request, reply) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      const { id, slotKey } = request.params as { id: string; slotKey: string };
      const result = await closeLatestScheduleSlotCheckin({
        planId: id,
        userId: payload.sub,
        slotKey,
      });
      if (!result.ok) {
        return reply.code(result.code).send({ message: result.message });
      }
      return reply.send({ ok: true });
    },
  );

  fastify.post(
    "/plans/:id/schedule/slots/:slotKey/appeals",
    { preHandler: fastify.requireRole("user") },
    async (request, reply) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      const { id, slotKey } = request.params as { id: string; slotKey: string };
      const body = normalizeBody(request.body);
      const content =
        isRecord(body) && typeof body.content === "string" ? body.content : "";
      const proofContent =
        isRecord(body) && typeof body.proofContent === "string"
          ? body.proofContent
          : undefined;
      const rawAtt =
        isRecord(body) && Array.isArray(body.proofAttachments)
          ? body.proofAttachments
          : [];
      const proofAttachments = rawAtt
        .filter((x): x is Record<string, unknown> => isRecord(x))
        .map((x) => ({
          url: typeof x.url === "string" ? x.url : "",
          fileName: typeof x.fileName === "string" ? x.fileName : undefined,
          kind: typeof x.kind === "string" ? x.kind : undefined,
        }))
        .filter((a) => a.url.trim().length > 0);
      const lastReview =
        isRecord(body) && body.lastReview !== undefined
          ? parseLastReviewFromBody(body.lastReview)
          : undefined;
      const result = await createScheduleSlotAppeal({
        planId: id,
        userId: payload.sub,
        slotKey,
        content,
        proofContent,
        proofAttachments: proofAttachments.length ? proofAttachments : undefined,
        lastReview,
      });
      if (!result.ok) {
        return reply.code(result.code).send({ message: result.message });
      }
      return reply.code(201).send({
        appeal: result.appeal,
        outcome: result.outcome,
        aiRationale: result.aiRationale,
        ...(result.submission ? { submission: result.submission } : {}),
      });
    },
  );

  fastify.delete(
    "/plans/:id/schedule/slots/:slotKey/appeals",
    { preHandler: fastify.requireRole("user") },
    async (request, reply) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      const { id, slotKey } = request.params as { id: string; slotKey: string };
      const result = await withdrawScheduleSlotAppeal({
        planId: id,
        userId: payload.sub,
        slotKey,
      });
      if (!result.ok) {
        return reply.code(result.code).send({ message: result.message });
      }
      return reply.send({ ok: true });
    },
  );

  fastify.get(
    "/plans/:id",
    { preHandler: fastify.requireRole("user") },
    async (request, reply) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      const { id } = request.params as { id: string };
      const plan = await getPlanWithDraft(id, payload.sub);
      if (!plan) return reply.code(404).send({ message: "plan not found" });
      return reply.send(plan);
    },
  );

  fastify.get(
    "/plans/:id/draft",
    { preHandler: fastify.requireRole("user") },
    async (request, reply) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      const { id } = request.params as { id: string };
      const result = await getPlanDraft(id, payload.sub);
      if (!result.ok)
        return reply.code(result.code).send({ message: result.message });
      return reply.send(result.draft);
    },
  );

  fastify.post(
    "/plans/:id/regenerate",
    { preHandler: fastify.requireRole("user") },
    async (request, reply) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      const { id } = request.params as { id: string };
      const body = normalizeBody(request.body);
      const requirement =
        isRecord(body) && typeof body.requirement === "string"
          ? body.requirement
          : undefined;
      const granularityMode =
        isRecord(body) && isOneOf(body.granularityMode, granularityModes)
          ? body.granularityMode
          : undefined;
      if (isDeepseekConfigured()) {
        const q = await reserveOnePlanAiQuotaUnit(payload.sub);
        if (!q.ok) return sendPlanAiQuotaExceeded(reply, q);
      }
      const result = await regeneratePlanVersion(
        id,
        payload.sub,
        requirement,
        granularityMode,
      );
      if (!result.ok)
        return reply.code(result.code).send({ message: result.message });
      return reply.send({
        versions: result.state.versions,
        maxVersions: result.state.maxVersions,
        confirmedVersion: result.state.confirmedVersion,
        canRegenerate: result.state.versions.length < result.state.maxVersions,
      });
    },
  );

  fastify.post(
    "/plans/:id/regenerate-stream",
    { preHandler: fastify.requireRole("user") },
    async (request, reply) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      const { id } = request.params as { id: string };
      const body = normalizeBody(request.body);
      const requirement =
        isRecord(body) && typeof body.requirement === "string"
          ? body.requirement
          : undefined;
      const granularityMode =
        isRecord(body) && isOneOf(body.granularityMode, granularityModes)
          ? body.granularityMode
          : undefined;

      const prep = await prepareRegeneratePlanStream(
        id,
        payload.sub,
        requirement,
        granularityMode,
      );
      if (!prep.ok) {
        return reply.code(prep.code).send({ message: prep.message });
      }
      const { ctx } = prep;

      if (isDeepseekConfigured()) {
        const q = await reserveOnePlanAiQuotaUnit(payload.sub);
        if (!q.ok) return sendPlanAiQuotaExceeded(reply, q);
      }

      const abort = new AbortController();
      const onClose = () => abort.abort();
      request.raw.socket?.once("close", onClose);

      const pass = new PassThrough();
      reply
        .header("Content-Type", "text/event-stream; charset=utf-8")
        .header("Cache-Control", "no-cache, no-transform")
        .header("Connection", "keep-alive")
        .header("X-Accel-Buffering", "no");
      reply.send(pass);
      pass.write(": stream\n\n");

      const writeEv = (obj: unknown) => {
        pass.write(`data: ${JSON.stringify(obj)}\n\n`);
      };

      void (async () => {
        let full = "";
        try {
          if (isDeepseekConfigured()) {
            const splitter = createDraftStreamSplitter();
            for await (const chunk of streamDeepseekChat(
              [
                { role: "system", content: REGENERATE_PLAN_SYSTEM },
                { role: "user", content: ctx.userContent },
              ],
              { signal: abort.signal },
            )) {
              const { deltaText, scheduleJsonStarted } =
                splitter.addChunk(chunk);
              if (deltaText) writeEv({ type: "delta_text", text: deltaText });
              if (scheduleJsonStarted) writeEv({ type: "body_complete" });
            }
            full = splitter.getFull();
          } else {
            const { requirementText } =
              parseRegenerateFallbackFromBaseRequirement(
                ctx.rawRequirement,
                ctx.expectedGranularity,
                ctx.slotKeys,
              );
            full = requirementText;
            writeEv({ type: "delta_text", text: requirementText });
            writeEv({ type: "body_complete" });
          }

          const upd = await persistRegenerateVersionFromStreamOutput(ctx, full);
          if (upd.ok) {
            writeEv({ type: "done", ok: true });
          } else {
            writeEv({ type: "error", message: upd.message });
          }
        } catch (err) {
          request.log.warn({ err }, "regenerate-stream failed");
          writeEv({
            type: "error",
            message: err instanceof Error ? err.message : "stream failed",
          });
        } finally {
          request.raw.socket?.off("close", onClose);
          pass.end();
        }
      })();
    },
  );

  fastify.post(
    "/plans/:id/confirm",
    { preHandler: fastify.requireRole("user") },
    async (request, reply) => {
      const parsed = validateConfirmPlanVersionBody(request.body);
      if (!parsed.ok) return reply.code(400).send({ message: parsed.message });
      const payload = await request.jwtVerify<{ sub: string }>();
      const { id } = request.params as { id: string };
      const result = await confirmPlanVersion(
        id,
        payload.sub,
        parsed.data.version,
      );
      if (!result.ok)
        return reply.code(result.code).send({ message: result.message });
      return reply.send({
        plan: result.plan,
        confirmedVersion: result.state.confirmedVersion,
      });
    },
  );

  fastify.get(
    "/plans/:id/compare",
    { preHandler: fastify.requireRole("user") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const query = request.query as { base?: string; target?: string };
      const baseVersion = Number(query.base);
      const targetVersion = Number(query.target);
      if (
        !Number.isInteger(baseVersion) ||
        !Number.isInteger(targetVersion) ||
        baseVersion < 1 ||
        targetVersion < 1
      ) {
        return reply
          .code(400)
          .send({ message: "base and target must be positive integers" });
      }
      const diff = await compareDraftVersions(id, baseVersion, targetVersion);
      if (!diff)
        return reply.code(404).send({ message: "compare versions not found" });
      return reply.send(diff);
    },
  );

  // —— 草稿页流式生成 v1 版本说明（SSE），完成后 updatePlanV1Requirement ——
  fastify.post(
    "/plans/:id/assistant-draft-stream",
    { preHandler: fastify.requireRole("user") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = validateAssistantDraftStreamBody(request.body);
      if (!parsed.ok) {
        return reply.code(400).send({ message: parsed.message });
      }
      const streamInput = parsed.data;
      const payload = await request.jwtVerify<{ sub: string }>();
      const draftRes = await getPlanDraft(id, payload.sub);
      if (!draftRes.ok) {
        return reply.code(draftRes.code).send({ message: draftRes.message });
      }
      const d = draftRes.draft;
      const plan = {
        goal: d.goal,
        requirement: d.requirement,
        draft: { versions: d.versions },
      };

      const memoryBlock = await buildPlanAssistantMemoryBlock(
        payload.sub,
      ).catch(() => "");

      if (isDeepseekConfigured()) {
        const q = await reserveOnePlanAiQuotaUnit(payload.sub);
        if (!q.ok) return sendPlanAiQuotaExceeded(reply, q);
      }

      const abort = new AbortController();
      const onClose = () => abort.abort();
      request.raw.socket?.once("close", onClose);

      const pass = new PassThrough();
      reply
        .header("Content-Type", "text/event-stream; charset=utf-8")
        .header("Cache-Control", "no-cache, no-transform")
        .header("Connection", "keep-alive")
        .header("X-Accel-Buffering", "no");
      reply.send(pass);
      /** 立即推一行 SSE 注释，便于浏览器/DevTools 识别为 EventStream 并尽早建立流 */
      pass.write(": stream\n\n");

      const writeEv = (obj: unknown) => {
        pass.write(`data: ${JSON.stringify(obj)}\n\n`);
      };

      void (async () => {
        let full = "";
        try {
          if (isDeepseekConfigured()) {
            const existingSchedule = plan.draft?.versions?.[0]?.schedule as
              | {
                  granularity: "day" | "week";
                  slots: Array<{ slotKey: string }>;
                }
              | undefined;
            const expectedGranularity =
              existingSchedule?.granularity ??
              decideScheduleGranularity({
                mode: "smart",
                startDate: new Date(
                  `${streamInput.startDate}T00:00:00.000Z`,
                ).toISOString(),
                endDate: new Date(
                  `${streamInput.endDate}T00:00:00.000Z`,
                ).toISOString(),
              });
            const slotKeys =
              existingSchedule?.slots?.map((s) => s.slotKey) ??
              buildScheduleSlotKeys({
                granularity: expectedGranularity,
                startDate: new Date(
                  `${streamInput.startDate}T00:00:00.000Z`,
                ).toISOString(),
                endDate: new Date(
                  `${streamInput.endDate}T00:00:00.000Z`,
                ).toISOString(),
              });

            const prompt = [
              ...(memoryBlock.trim()
                ? [`${memoryBlock.trim()}\n`, ""]
                : []),
              streamInput.assistantPrompt.trim(),
              ...(isTravelLikeRequirementText(streamInput.assistantPrompt)
                ? ["", TRAVEL_SCHEDULE_INSTRUCTIONS]
                : []),
              "",
              "请在正文后追加一个严格的 JSON 代码块（```json ...```），仅包含如下结构：",
              "{",
              '  "schedule": {',
              `    "granularity": "${expectedGranularity}",`,
              '    "slots": [',
              '      { "slotKey": "...", "content": "...", "checkinSpec": { "criteria": ["..."], "evidenceHint": "..." } }',
              "    ]",
              "  }",
              "}",
              "要求：slotKey 必须严格来自下方「时间槽」列表，且顺序必须完全一致；content 为当期计划一段中文（1-3句，具体可执行）。可选 checkinSpec：criteria 为 2-5 条可验收短句，evidenceHint 提示应提交何种证明。",
              "",
              "时间槽：",
              ...slotKeys.map((k) => `- ${k}`),
            ].join("\n");

            const splitter = createDraftStreamSplitter();
            for await (const chunk of streamDeepseekChat(
              [
                {
                  role: "system",
                  content: isTravelLikeRequirementText(streamInput.assistantPrompt)
                    ? DEEPSEEK_SYSTEM_TRAVEL
                    : DEEPSEEK_SYSTEM,
                },
                { role: "user", content: prompt },
              ],
              { signal: abort.signal },
            )) {
              const { deltaText, scheduleJsonStarted } =
                splitter.addChunk(chunk);
              if (deltaText) writeEv({ type: "delta_text", text: deltaText });
              if (scheduleJsonStarted) writeEv({ type: "body_complete" });
            }
            full = splitter.getFull();
          } else {
            full = formatDraftToText({
              goal: plan.goal,
              startDate: streamInput.startDate,
              endDate: streamInput.endDate,
              cycle: streamInput.cycle,
              requirement: plan.requirement,
            });
            writeEv({ type: "delta_text", text: full });
            writeEv({ type: "body_complete" });
          }

          const upd = await updatePlanV1Requirement(id, payload.sub, full);
          if (upd.ok) {
            writeEv({ type: "done", ok: true });
          } else {
            writeEv({ type: "error", message: upd.message });
          }
        } catch (err) {
          request.log.warn({ err }, "assistant-draft-stream failed");
          writeEv({
            type: "error",
            message: err instanceof Error ? err.message : "stream failed",
          });
        } finally {
          request.raw.socket?.off("close", onClose);
          pass.end();
        }
      })();
    },
  );

  // —— 创建页 / 专业版对话：非流式 AI 或本地模板 ——
  fastify.post(
    "/plans/assistant",
    { preHandler: fastify.requireRole("user") },
    async (request, reply) => {
      const parsed = validateAssistantBody(request.body);
      if (!parsed.ok) {
        return reply.code(400).send({ message: parsed.message });
      }

      const body = parsed.data;
      const payload = await request.jwtVerify<{ sub: string }>();
      const memoryBlock = await buildPlanAssistantMemoryBlock(
        payload.sub,
      ).catch(() => "");
      const draftText = formatDraftToText({
        goal: body.goal,
        startDate: body.startDate,
        endDate: body.endDate,
        cycle: body.cycle,
        requirement: body.requirement,
      });

      // Pro Agent：生成→批评→打分→自动优化→再给选项（库表 pro / 白名单 / 全员试用开关，且前端显式请求 tier|agent=pro）
      const isPro = await userMayUsePlanProAgentFeatures(payload.sub);
      const wantProAgent =
        isPro &&
        (((request.body as any)?.agent ?? "").toString() === "pro" ||
          ((request.body as any)?.tier ?? "").toString() === "pro");

      if (isDeepseekConfigured()) {
        const q = await reserveOnePlanAiQuotaUnit(payload.sub);
        if (!q.ok) return sendPlanAiQuotaExceeded(reply, q);
      }

      if (wantProAgent) {
        const memoryPrefix = memoryBlock.trim() || undefined;
        const cacheKeyBase = buildPlanAssistantCacheKey({
          mode: body.mode,
          goal: body.goal,
          requirement: body.requirement,
          memoryPrefix,
          startDate: body.startDate,
          endDate: body.endDate,
          cycle: body.cycle,
          message: body.message,
          granularityMode: body.granularityMode,
        });

        const router = createLlmRouter({
          providers: [createDeepseekProvider()],
          defaultTtlMs: 60_000,
          onMetric: (m) => request.log.info(m, "llm metric"),
        });

        const agentRes = await runProPlanAgent({
          input: {
            userId: payload.sub,
            mode: body.mode,
            goal: body.goal,
            requirement: body.requirement,
            memoryPrefix,
            startDate: body.startDate,
            endDate: body.endDate,
            cycle: body.cycle,
            granularityMode: body.granularityMode,
            message: body.message,
          },
          llm: {
            complete: async ({ task, cacheKey, messages }) => {
              // 未配置 DeepSeek：直接返回本地草稿（agent 内会走 schedule fallback + 自动优化 + options）
              if (!isDeepseekConfigured()) return { text: draftText };
              const out = await router.complete({
                task: "plan_assistant",
                cacheKey: `${cacheKeyBase}:${task}:${cacheKey}`,
                messages,
              });
              return {
                text: out.text,
                providerId: out.providerId,
                cached: out.cached,
              };
            },
          },
        });

        return reply.send({
          reply: agentRes.draft.reply,
          suggestedContent: agentRes.revised.suggestedContent,
          schedule: agentRes.revised.schedule,
          meta: {
            usedAgent: "pro",
            score: agentRes.review.scoreTotal,
            scoreBreakdown: agentRes.review.scoreBreakdown,
            issues: agentRes.review.issues,
            options: agentRes.options,
            diffSummary: agentRes.revised.diffSummary,
            assumptions: agentRes.draft.assumptions,
            adviceText: buildProAssistantAdviceText(
              agentRes.review.scoreTotal,
              agentRes.review.issues,
            ),
          },
        });
      }

      const deepseekResult = await tryDeepseekAssistant(
        request.log,
        body,
        draftText,
        memoryBlock,
      );
      if (deepseekResult) {
        return reply.send(deepseekResult);
      }

      if (body.mode === "draft") {
        return reply.send({
          reply:
            "我已基于你的基础信息生成初稿，你可以继续对话让我细化成每周/每日执行版本。",
          suggestedContent: draftText,
        });
      }

      const merged = `${body.requirement}\n\n用户补充：${body.message}`;
      return reply.send({
        reply:
          "收到，我已将你的补充合并进计划内容。是否需要我再拆分为更细的每周任务清单？",
        suggestedContent: merged,
      });
    },
  );

  // —— 创建页：流式计划助手（SSE，像 ChatGPT 一样逐字输出；结束后给 meta 建议/选项）——
  fastify.post(
    "/plans/assistant-stream",
    { preHandler: fastify.requireRole("user") },
    async (request, reply) => {
      const parsed = validateAssistantStreamBody(request.body);
      if (!parsed.ok) return reply.code(400).send({ message: parsed.message });
      const body = parsed.data;
      const payload = await request.jwtVerify<{ sub: string }>();

      const draftText = formatDraftToText({
        goal: body.goal,
        startDate: body.startDate,
        endDate: body.endDate,
        cycle: body.cycle,
        requirement: body.requirement,
      });

      const isPro = await userMayUsePlanProAgentFeatures(payload.sub);
      const wantProAgent =
        isPro && (body.tier === "pro" || body.agent === "pro");

      if (isDeepseekConfigured()) {
        const q = await reserveOnePlanAiQuotaUnit(payload.sub);
        if (!q.ok) return sendPlanAiQuotaExceeded(reply, q);
      }

      const memoryBlock = await buildPlanAssistantMemoryBlock(
        payload.sub,
      ).catch(() => "");

      const pass = new PassThrough();
      reply
        .header("Content-Type", "text/event-stream; charset=utf-8")
        .header("Cache-Control", "no-cache, no-transform")
        .header("Connection", "keep-alive")
        .header("X-Accel-Buffering", "no");
      reply.send(pass);
      pass.write(": stream\n\n");

      const writeEv = (obj: unknown) => {
        pass.write(`data: ${JSON.stringify(obj)}\n\n`);
      };

      const abort = new AbortController();
      const onClose = () => abort.abort();
      request.raw.socket?.once("close", onClose);

      void (async () => {
        let full = "";
        try {
          if (isDeepseekConfigured()) {
            const splitter = createDraftStreamSplitter();
            // 复用 /plans/assistant 的 system + user prompt 结构（draft 模式为主）
            const effectiveMode: GranularityMode = isOneOf(
              body.granularityMode,
              granularityModes,
            )
              ? body.granularityMode
              : "smart";
            const startDateIso = new Date(
              `${body.startDate}T00:00:00.000Z`,
            ).toISOString();
            const endDateIso = new Date(
              `${body.endDate}T00:00:00.000Z`,
            ).toISOString();
            const expectedGranularity = decideScheduleGranularity({
              mode: effectiveMode,
              startDate: startDateIso,
              endDate: endDateIso,
            });
            const slotKeys = buildScheduleSlotKeys({
              granularity: expectedGranularity,
              startDate: startDateIso,
              endDate: endDateIso,
            });
            const baseRequirement =
              body.requirement.trim().length > 0
                ? body.requirement
                : `请根据以下目标生成计划：${body.goal}`;
            const travelLike = isTravelLikeRequirementText(baseRequirement);
            const userContent = [
              ...(memoryBlock.trim()
                ? [`${memoryBlock.trim()}\n`, ""]
                : []),
              `目标：${body.goal}`,
              `起始：${body.startDate}，预计完成：${body.endDate}，周期代码：${body.cycle}`,
              "",
              `补充说明：`,
              baseRequirement,
              ...(travelLike ? ["", TRAVEL_SCHEDULE_INSTRUCTIONS] : []),
              "",
              `请输出两部分：`,
              `1) 可直接保存为「计划内容」的中文正文；`,
              `2) 在最后输出一个严格的 JSON 代码块（\`\`\`json ...\`\`\`），仅包含如下结构：`,
              `{`,
              `  "schedule": {`,
              `    "granularity": "${expectedGranularity}",`,
              `    "slots": [`,
              `      { "slotKey": "...", "content": "...", "checkinSpec": { "criteria": ["..."], "evidenceHint": "..." } }`,
              `    ]`,
              `  }`,
              `}`,
              `注意：slotKey 必须严格来自下方「时间槽」列表，且顺序必须完全一致；content 为当期计划一段中文（1-3句，具体可执行）。可选 checkinSpec：criteria 为 2-5 条可验收短句，evidenceHint 提示应提交何种证明。`,
              "",
              "时间槽：",
              ...slotKeys.map((k) => `- ${k}`),
            ].join("\n");

            for await (const chunk of streamDeepseekChat(
              [
                { role: "system", content: travelLike ? DEEPSEEK_SYSTEM_TRAVEL : DEEPSEEK_SYSTEM },
                { role: "user", content: userContent },
              ],
              { signal: abort.signal },
            )) {
              const { deltaText, scheduleJsonStarted } =
                splitter.addChunk(chunk);
              if (deltaText) writeEv({ type: "delta_text", text: deltaText });
              if (scheduleJsonStarted) writeEv({ type: "body_complete" });
            }
            full = splitter.getFull();
          } else {
            full = draftText;
            writeEv({ type: "delta_text", text: full });
            writeEv({ type: "body_complete" });
          }

          // 流式正文结束后，生成建议/选项（Pro 才做）
          if (wantProAgent) {
            const memoryPrefix = memoryBlock.trim() || undefined;
            const cacheKeyBase = buildPlanAssistantCacheKey({
              mode: "draft",
              goal: body.goal,
              requirement: body.requirement,
              memoryPrefix,
              startDate: body.startDate,
              endDate: body.endDate,
              cycle: body.cycle,
              granularityMode: body.granularityMode,
            });
            const router = createLlmRouter({
              providers: [createDeepseekProvider()],
              defaultTtlMs: 60_000,
              onMetric: (m) => request.log.info(m, "llm metric"),
            });
            // 让 pro agent 复用同一份 full 输出（不再二次调用模型）
            const agentRes = await runProPlanAgent({
              input: {
                userId: payload.sub,
                mode: "draft",
                goal: body.goal,
                requirement: body.requirement,
                memoryPrefix,
                startDate: body.startDate,
                endDate: body.endDate,
                cycle: body.cycle,
                granularityMode: body.granularityMode,
              },
              llm: {
                complete: async () => {
                  // 为了让 agent 的缓存 key 形态一致，仍用 router.complete 记录 metric，但内容直接返回 full
                  if (!isDeepseekConfigured()) return { text: full };
                  // 如果 DeepSeek 已配置，走一次 router 缓存“同输入的 full”，避免未来重复生成
                  const out = await router
                    .complete({
                      task: "plan_assistant",
                      cacheKey: `${cacheKeyBase}:stream:final`,
                      messages: [{ role: "user", content: "stream-final" }],
                    })
                    .catch(() => null);
                  void out;
                  return { text: full };
                },
              },
            });
            writeEv({
              type: "meta_ready",
              meta: {
                score: agentRes.review.scoreTotal,
                scoreBreakdown: agentRes.review.scoreBreakdown,
                issues: agentRes.review.issues,
                options: agentRes.options,
                diffSummary: agentRes.revised.diffSummary,
                assumptions: agentRes.draft.assumptions,
                adviceText: buildProAssistantAdviceText(
                  agentRes.review.scoreTotal,
                  agentRes.review.issues,
                ),
              },
              suggestedContent: agentRes.revised.suggestedContent,
              schedule: agentRes.revised.schedule,
            });
          }

          writeEv({ type: "done", ok: true });
        } catch (err) {
          request.log.warn({ err }, "assistant-stream failed");
          writeEv({
            type: "error",
            message: err instanceof Error ? err.message : "stream failed",
          });
        } finally {
          request.raw.socket?.off("close", onClose);
          pass.end();
        }
      })();
    },
  );

  // —— Pro：对已生成的优化版应用“选项/自定义优化”（用于创建页 B gate 的确认动作） ——
  fastify.post(
    "/plans/assistant/apply-option",
    { preHandler: fastify.requireRole("user") },
    async (request, reply) => {
      const parsed = validateAssistantApplyOptionBody(request.body);
      if (!parsed.ok) return reply.code(400).send({ message: parsed.message });
      const body = parsed.data;

      // v1：先做稳定可复现的“局部增强”，不依赖外部模型；后续可接 pro-plan-agent 的二次优化能力
      const optionMap: Record<
        string,
        { title: string; patch: string; diff: string }
      > = {
        more_granular: {
          title: "更细到天（更具体）",
          patch:
            "将每个时间槽进一步拆成更小的可执行动作；每个动作都包含“证据/产出”。",
          diff: "按更细粒度补充行动与证据提示",
        },
        save_time: {
          title: "更省时（更轻量）",
          patch:
            "将每个时间槽压缩为 30–45 分钟内可完成的最小动作，同时保留证据记录。",
          diff: "将行动项收敛为更轻量的最小动作",
        },
        more_steady: {
          title: "更稳（更抗波动）",
          patch:
            "为每个时间槽增加“保底动作 + 加分动作”，保证最差情况下也能推进。",
          diff: "增加保底/加分动作以提升抗波动能力",
        },
        more_aggressive: {
          title: "更激进（更快达成）",
          patch: "在不超出时间预算前提下提高每周产出强度，并明确每周验收产物。",
          diff: "提高产出强度并明确周验收产物",
        },
      };

      const diffSummary: string[] = [];
      let suggestedContent = body.baseSuggestedContent.trim();

      if (body.optionId) {
        const opt = optionMap[body.optionId];
        if (opt) {
          diffSummary.push(opt.diff);
          suggestedContent =
            `${suggestedContent}\n\n## 已应用优化选项：${opt.title}\n- ${opt.patch}`.trim();
        }
      }
      if (body.customText?.trim()) {
        diffSummary.push("应用用户自定义优化内容");
        suggestedContent =
          `${suggestedContent}\n\n## 用户自定义优化\n${body.customText.trim()}`.trim();
      }

      if (diffSummary.length === 0)
        diffSummary.push("无额外优化变更（保持默认优化版）");

      return reply.send({
        suggestedContent,
        schedule: body.baseSchedule,
        meta: { diffSummary },
      });
    },
  );

  // —— 上传 docx/txt/md 等，抽取纯文本供前端填表 ——
  fastify.post(
    "/plans/parse-file",
    { preHandler: fastify.requireRole("user") },
    async (request, reply) => {
      const parsed = validateParsePlanFileBody(request.body);
      if (!parsed.ok) {
        return reply.code(400).send({ message: parsed.message });
      }

      const { fileName, contentBase64 } = parsed.data;
      const extension = getFileExtension(fileName);
      const allowedExtensions = ["txt", "md", "markdown", "doc", "docx"];
      if (!allowedExtensions.includes(extension)) {
        return reply
          .code(400)
          .send({ message: "file extension is not supported" });
      }

      const buffer = Buffer.from(contentBase64, "base64");
      let extractedText = "";

      if (
        extension === "txt" ||
        extension === "md" ||
        extension === "markdown"
      ) {
        extractedText = sanitizeTextContent(buffer.toString("utf8"));
      } else if (extension === "docx") {
        const result = await mammoth.extractRawText({ buffer });
        extractedText = sanitizeTextContent(result.value);
      } else {
        extractedText = sanitizeTextContent(buffer.toString("utf8"));
      }

      if (!extractedText) {
        return reply
          .code(422)
          .send({ message: "failed to extract readable text from file" });
      }

      return reply.send({
        text: extractedText,
      });
    },
  );
}
