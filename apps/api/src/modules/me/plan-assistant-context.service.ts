/**
 * ToC：计划助手「结构化记忆」+ 非 RAG 的完成度摘要（规则模板拼接）。
 */
import { prisma } from "../../lib/prisma";
import { listPlansForUser } from "../plans/plan.service";
import { getAiQuotaStatus } from "../billing/ai-quota.service";

const MAX_PINNED = 5;
const MAX_PIN_LEN = 200;
/** 计划书约定约 200～400 字中文摘要；硬上限略放宽以便列表略长时仍可读 */
const MAX_SUMMARY_CHARS = 400;

export type PlanAssistantProfileDto = {
  tone: string | null;
  language: string | null;
  weeklyHoursCap: number | null;
  preferMorning: boolean | null;
  evidenceTolerance: string | null;
  defaultScenario: string | null;
  pinnedNotes: string[];
};

function parsePinned(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_PINNED);
}

export async function getPlanAssistantProfileRow(
  userId: string,
): Promise<PlanAssistantProfileDto | null> {
  const exists = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!exists) return null;

  const row = await prisma.userPlanAssistantProfile.findUnique({
    where: { userId },
  });
  if (!row) {
    return {
      tone: null,
      language: "zh",
      weeklyHoursCap: null,
      preferMorning: null,
      evidenceTolerance: null,
      defaultScenario: null,
      pinnedNotes: [],
    };
  }
  return {
    tone: row.tone,
    language: row.language ?? "zh",
    weeklyHoursCap: row.weeklyHoursCap,
    preferMorning: row.preferMorning,
    evidenceTolerance: row.evidenceTolerance,
    defaultScenario: row.defaultScenario,
    pinnedNotes: parsePinned(row.pinnedNotes),
  };
}

export async function patchPlanAssistantProfile(
  userId: string,
  data: Partial<{
    tone: string | null;
    language: string | null;
    weeklyHoursCap: number | null;
    preferMorning: boolean | null;
    evidenceTolerance: string | null;
    defaultScenario: string | null;
    pinnedNotes: string[];
  }>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const exists = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!exists) return { ok: false, message: "User not found" };

  const current = await prisma.userPlanAssistantProfile.findUnique({
    where: { userId },
  });
  const base: PlanAssistantProfileDto = current
    ? {
        tone: current.tone,
        language: current.language ?? "zh",
        weeklyHoursCap: current.weeklyHoursCap,
        preferMorning: current.preferMorning,
        evidenceTolerance: current.evidenceTolerance,
        defaultScenario: current.defaultScenario,
        pinnedNotes: parsePinned(current.pinnedNotes),
      }
    : {
        tone: null,
        language: "zh",
        weeklyHoursCap: null,
        preferMorning: null,
        evidenceTolerance: null,
        defaultScenario: null,
        pinnedNotes: [],
      };

  const next: PlanAssistantProfileDto = {
    tone: data.tone !== undefined ? data.tone : base.tone,
    language: data.language !== undefined ? data.language ?? "zh" : base.language,
    weeklyHoursCap:
      data.weeklyHoursCap !== undefined ? data.weeklyHoursCap : base.weeklyHoursCap,
    preferMorning:
      data.preferMorning !== undefined ? data.preferMorning : base.preferMorning,
    evidenceTolerance:
      data.evidenceTolerance !== undefined
        ? data.evidenceTolerance
        : base.evidenceTolerance,
    defaultScenario:
      data.defaultScenario !== undefined
        ? data.defaultScenario
        : base.defaultScenario,
    pinnedNotes:
      data.pinnedNotes !== undefined ? data.pinnedNotes.slice(0, MAX_PINNED) : base.pinnedNotes,
  };

  for (const n of next.pinnedNotes) {
    if (n.length > MAX_PIN_LEN) {
      return { ok: false, message: `pinned note too long (max ${MAX_PIN_LEN})` };
    }
  }

  await prisma.userPlanAssistantProfile.upsert({
    where: { userId },
    create: {
      userId,
      tone: next.tone,
      language: next.language,
      weeklyHoursCap: next.weeklyHoursCap,
      preferMorning: next.preferMorning,
      evidenceTolerance: next.evidenceTolerance,
      defaultScenario: next.defaultScenario,
      pinnedNotes: next.pinnedNotes,
    },
    update: {
      tone: next.tone,
      language: next.language,
      weeklyHoursCap: next.weeklyHoursCap,
      preferMorning: next.preferMorning,
      evidenceTolerance: next.evidenceTolerance,
      defaultScenario: next.defaultScenario,
      pinnedNotes: next.pinnedNotes,
    },
  });
  return { ok: true };
}

export async function appendPinnedNote(
  userId: string,
  text: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const t = text.trim();
  if (!t) return { ok: false, message: "text is required" };
  if (t.length > MAX_PIN_LEN) {
    return { ok: false, message: `text must be at most ${MAX_PIN_LEN} characters` };
  }
  const exists = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!exists) return { ok: false, message: "User not found" };

  const row = await prisma.userPlanAssistantProfile.findUnique({
    where: { userId },
    select: { pinnedNotes: true },
  });
  const prev = parsePinned(row?.pinnedNotes);
  const next = [...prev.filter((x) => x !== t), t].slice(-MAX_PINNED);

  await prisma.userPlanAssistantProfile.upsert({
    where: { userId },
    create: {
      userId,
      pinnedNotes: next,
    },
    update: { pinnedNotes: next },
  });
  return { ok: true };
}

export async function buildPlanCompletionSummary(userId: string): Promise<string> {
  const plans = await listPlansForUser(userId);
  const recent = plans.slice(0, 5);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);
  const checkins = await prisma.planScheduleSlotSubmission.count({
    where: {
      userId,
      closedAt: null,
      createdAt: { gte: since },
    },
  });

  const parts: string[] = [];
  parts.push(
    `你在本系统当前有 ${plans.length} 个未删除且未归档的已定稿计划（进行中或已完成以打卡进度为准）。`,
  );
  if (recent.length) {
    let done = 0;
    for (const p of recent) if (p.completed) done++;
    parts.push(
      `最近关注的 ${recent.length} 条里：标记为已全部打卡完成的有 ${done} 条，其余仍在推进。`,
    );
    for (const p of recent.slice(0, 3)) {
      const day = p.deadline.slice(0, 10);
      const state = p.completed ? "已完成打卡闭环" : "进行中";
      const miss = p.todayMissing ? "（今日窗口内尚有待提交打卡）" : "";
      parts.push(`- 「${p.goal.slice(0, 40)}${p.goal.length > 40 ? "…" : ""}」截止 ${day}，${state}${miss}。`);
    }
  } else {
    parts.push("最近尚未有已定稿计划进入列表，可从创建第一个计划开始积累打卡数据。");
  }
  parts.push(`近 30 天你共提交约 ${checkins} 条打卡记录（含补交，未关闭的提交）。`);
  parts.push("以上由系统根据数据库自动汇总，请勿当作医疗/法律/投资建议；生成计划时请结合用户本次表单内容优先。");

  return parts.join("\n").slice(0, MAX_SUMMARY_CHARS);
}

export function profileToMemoryLines(p: PlanAssistantProfileDto): string[] {
  const lines: string[] = [];
  if (p.tone === "concise") lines.push("用户偏好：输出尽量简洁，少套话。");
  if (p.tone === "detailed") lines.push("用户偏好：输出可更详细，步骤与验收写清楚。");
  if (p.weeklyHoursCap != null && p.weeklyHoursCap > 0) {
    lines.push(`用户自称每周可投入约 ${p.weeklyHoursCap} 小时（上限提示，以本次表单为准）。`);
  }
  if (p.preferMorning === true) lines.push("用户偏好：尽量安排早晨时段的可执行动作。");
  if (p.evidenceTolerance === "low") {
    lines.push("用户对打卡证据要求偏轻量（勾选/短句即可，少要附件）。");
  }
  if (p.evidenceTolerance === "medium") {
    lines.push("用户接受适度的打卡证据与验收描述。");
  }
  if (p.defaultScenario) {
    const map: Record<string, string> = {
      study: "学习备考",
      work: "工作项目",
      travel: "旅行行程",
      general: "通用/习惯",
    };
    lines.push(`用户常用计划场景：${map[p.defaultScenario] ?? p.defaultScenario}。`);
  }
  if (p.pinnedNotes.length) {
    lines.push("用户要求长期记住的要点：");
    for (const n of p.pinnedNotes) lines.push(`- ${n}`);
  }
  return lines;
}

/** 拼入模型上下文的记忆块（UTF-8 长度可控） */
export async function buildPlanAssistantMemoryBlock(
  userId: string,
): Promise<string> {
  const profile = await getPlanAssistantProfileRow(userId);
  if (!profile) return "";
  const summary = await buildPlanCompletionSummary(userId);
  const profLines = profileToMemoryLines(profile);
  const block = [
    "【系统注入：用户画像与近期执行摘要（勿向用户复述此段标题；用于对齐风格与节奏）】",
    ...profLines,
    "",
    "【近期计划与打卡（系统摘要）】",
    summary,
  ].join("\n");
  return block.slice(0, 1800);
}

export function validatePlanAssistantProfilePatch(body: unknown):
  | { ok: true; data: Partial<PlanAssistantProfileDto> }
  | { ok: false; message: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, message: "body must be an object" };
  }
  const o = body as Record<string, unknown>;
  const out: Partial<PlanAssistantProfileDto> = {};

  if ("tone" in o) {
    const v = o.tone;
    if (v !== null && v !== undefined && v !== "") {
      if (v !== "concise" && v !== "detailed") {
        return { ok: false, message: "tone must be concise, detailed, or null" };
      }
      out.tone = v as string;
    } else {
      out.tone = null;
    }
  }
  if ("language" in o) {
    const v = o.language;
    if (v !== null && v !== undefined && v !== "" && v !== "zh") {
      return { ok: false, message: "language must be zh" };
    }
    out.language = v == null || v === "" ? "zh" : "zh";
  }
  if ("weeklyHoursCap" in o) {
    const v = o.weeklyHoursCap;
    if (v === null || v === undefined || v === "") {
      out.weeklyHoursCap = null;
    } else if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 168) {
      out.weeklyHoursCap = v;
    } else {
      return { ok: false, message: "weeklyHoursCap must be 1-168 or null" };
    }
  }
  if ("preferMorning" in o) {
    const v = o.preferMorning;
    if (v === null || v === undefined) out.preferMorning = null;
    else if (typeof v === "boolean") out.preferMorning = v;
    else return { ok: false, message: "preferMorning must be boolean" };
  }
  if ("evidenceTolerance" in o) {
    const v = o.evidenceTolerance;
    if (v === null || v === undefined || v === "") out.evidenceTolerance = null;
    else if (v === "low" || v === "medium") out.evidenceTolerance = v;
    else return { ok: false, message: "evidenceTolerance must be low or medium" };
  }
  if ("defaultScenario" in o) {
    const v = o.defaultScenario;
    if (v === null || v === undefined || v === "") out.defaultScenario = null;
    else if (
      v === "study" ||
      v === "work" ||
      v === "travel" ||
      v === "general"
    ) {
      out.defaultScenario = v;
    } else {
      return {
        ok: false,
        message: "defaultScenario must be study|work|travel|general|null",
      };
    }
  }
  if ("pinnedNotes" in o) {
    const v = o.pinnedNotes;
    if (!Array.isArray(v)) {
      return { ok: false, message: "pinnedNotes must be an array of strings" };
    }
    const notes = v
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX_PINNED);
    for (const n of notes) {
      if (n.length > MAX_PIN_LEN) {
        return { ok: false, message: `pinned note max ${MAX_PIN_LEN} chars` };
      }
    }
    out.pinnedNotes = notes;
  }

  if (Object.keys(out).length === 0) {
    return { ok: false, message: "no valid fields to update" };
  }
  return { ok: true, data: out };
}

export async function getPlanAssistantContextForApi(userId: string) {
  const profile = await getPlanAssistantProfileRow(userId);
  if (!profile) {
    return null;
  }
  const completionSummary = await buildPlanCompletionSummary(userId);
  const aiQuota = await getAiQuotaStatus(userId);
  return {
    profile,
    completionSummary,
    quotaHint: aiQuota
      ? {
          used: aiQuota.used,
          limit: aiQuota.limit,
          yearMonth: aiQuota.yearMonth,
        }
      : null,
  };
}
