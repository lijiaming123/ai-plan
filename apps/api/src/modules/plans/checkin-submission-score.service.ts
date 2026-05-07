/**
 * 打卡完成证明：优先 DeepSeek 大模型审核；未配置或调用失败时回退启发式（与 tests 环境一致）。
 */
import { completeDeepseekChat, isDeepseekConfigured } from "../../lib/deepseek";
import type { CheckinSpec, CheckinSlot } from "./deepseek-schedule";
import { deriveCheckinSpecFromSlotContent, extractLastJsonCodeBlock } from "./deepseek-schedule";

export type CheckinReviewBand = "low" | "mid" | "high";

export type CheckinReviewDimension = {
  id: "relevance" | "evidence" | "substance";
  label: string;
  band: CheckinReviewBand;
  hint: string;
};

export type CheckinPublicReview = {
  passed: boolean;
  dimensions: CheckinReviewDimension[];
  summary: string;
};

export type CheckinAttachmentMeta = {
  fileName?: string;
  kind: string;
};

const LABEL: Record<CheckinReviewDimension["id"], string> = {
  relevance: "与任务相关",
  evidence: "证据充分",
  substance: "说明具体",
};

const ORDER: CheckinReviewDimension["id"][] = ["relevance", "evidence", "substance"];

function norm(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

function toBand(score: number): CheckinReviewBand {
  if (score < 38) return "low";
  if (score < 65) return "mid";
  return "high";
}

function stripEdgePunct(s: string): string {
  return s.replace(/^[（(\[【"'「]/g, "").replace(/[）)\]」'"。]+$/, "").trim();
}

/** 单条要点是否在用户说明中出现（支持中英文大小写、去掉括号后匹配） */
function userCoversPart(userRaw: string, partRaw: string): boolean {
  const part = stripEdgePunct(partRaw);
  if (part.length < 2) return false;
  const user = userRaw.trim();
  if (!user) return false;
  if (user.includes(part)) return true;
  const pl = part.toLowerCase();
  const ul = user.toLowerCase();
  return ul.includes(pl);
}

/**
 * 从「计划正文 + 派生标准」拆成较细的比对片段：句号、逗号、顿号、括号内列举等，
 * 避免把「（A、B、C、D）」整段当作一个必须整段命中的子串。
 */
function expandOverlapFragments(combinedTaskText: string): string[] {
  const primary = combinedTaskText
    .split(/[。.;；!！?？\s,，\n\r、]+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);
  const out: string[] = [];
  for (const p of primary) {
    if (p.includes("、") && p.length > 12) {
      const subs = p
        .split(/、+/g)
        .map((x) => stripEdgePunct(x.trim()))
        .filter((x) => x.length >= 2 && x.length <= 80);
      if (subs.length >= 2) {
        out.push(...subs.slice(0, 12));
        continue;
      }
    }
    out.push(stripEdgePunct(p));
  }
  const dedup: string[] = [];
  for (const x of out) {
    if (x.length < 2) continue;
    if (!dedup.some((d) => d === x)) dedup.push(x);
  }
  return dedup.slice(0, 18);
}

function tokenOverlapScore(task: string, user: string): number {
  const parts = expandOverlapFragments(task);
  if (parts.length === 0) return 50;
  let hit = 0;
  for (const p of parts) {
    if (userCoversPart(user, p)) hit += 1;
  }
  return Math.min(100, 32 + (hit / parts.length) * 68);
}

function duplicateLike(task: string, user: string): boolean {
  const a = norm(task);
  const b = norm(user);
  if (a.length < 6 || b.length < 6) return false;
  if (a === b) return true;
  if (a.includes(b) && b.length / a.length >= 0.88) return true;
  if (b.includes(a) && a.length / b.length >= 0.88) return true;
  return false;
}

function scoreEvidence(textLen: number, attachmentCount: number): number {
  if (attachmentCount > 0) return 92;
  if (textLen >= 80) return 82;
  if (textLen >= 40) return 70;
  if (textLen >= 25) return 55;
  return Math.min(45, textLen * 2);
}

function scoreSubstance(task: string, user: string, attachmentCount: number): number {
  if (duplicateLike(task, user)) return 22;
  if (attachmentCount > 0 && user.trim().length < 8) return 68;
  if (user.trim().length >= 20) return 82;
  if (user.trim().length >= 10) return 62;
  return 48;
}

function dimensionHints(
  id: CheckinReviewDimension["id"],
  band: CheckinReviewBand,
): string {
  const hints: Record<CheckinReviewDimension["id"], Record<CheckinReviewBand, string>> = {
    relevance: {
      low: "与本期计划对照不够紧。请写明你针对本期任务做了哪些具体动作或产出。",
      mid: "与本期任务有一定关联；若再补充与计划条目对应的关键词或结果会更好。",
      high: "与本期任务目标对齐较好。",
    },
    evidence: {
      low: "可核验材料偏少。建议上传截图/文档/链接，或把过程与结果写清楚。",
      mid: "有一定说明或附件；仍建议补充更直观的完成痕迹。",
      high: "证据链较完整，便于核验。",
    },
    substance: {
      low: "说明偏笼统或与计划原文过于相似。请写清自主完成的内容，避免只复制计划。",
      mid: "有一定实质内容；可再补充结果、数据或截图要点。",
      high: "说明较具体，能看出实际投入。",
    },
  };
  return hints[id][band];
}

/** 本地启发式（无 DEEPSEEK 或 LLM 失败时使用） */
export function evaluateCheckinSubmissionHeuristic(input: {
  slot: CheckinSlot;
  userContent: string;
  attachmentCount: number;
}): { pass: boolean; review: CheckinPublicReview; internalOverall: number } {
  const task = input.slot.content?.trim() || input.slot.generatedContent?.trim() || "";
  const spec: CheckinSpec =
    input.slot.checkinSpec ?? deriveCheckinSpecFromSlotContent(task);
  const user = input.userContent.trim();
  const n = input.attachmentCount;

  let rel = tokenOverlapScore([task, ...spec.criteria].join("。"), user);
  if (n > 0) rel = Math.max(rel, 72);
  const ev = scoreEvidence(user.length, n);
  const sub = scoreSubstance(task, user, n);

  const overall = Math.round(rel * 0.35 + ev * 0.35 + sub * 0.3);
  /** 略放宽：有附件或说明较长时更容易达线，减少「已分项说明却仍判不相关」的假阴性 */
  const pass = overall >= 54;

  const dimensions: CheckinReviewDimension[] = ORDER.map((id) => {
    const sc = id === "relevance" ? rel : id === "evidence" ? ev : sub;
    const b = toBand(sc);
    return {
      id,
      label: LABEL[id],
      band: b,
      hint: dimensionHints(id, b),
    };
  });

  const review: CheckinPublicReview = {
    passed: pass,
    dimensions,
    summary: pass
      ? "已通过核验，可正式提交。"
      : "未达通过标准，本次不会保存。请按下方提示补充后再提交。",
  };

  return { pass, review, internalOverall: overall };
}

function bandToScore(b: CheckinReviewBand): number {
  if (b === "low") return 35;
  if (b === "mid") return 60;
  return 88;
}

function parseJsonFromLlmText(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t) as unknown;
  } catch {
    const fromFence = extractLastJsonCodeBlock(t);
    if (fromFence) {
      try {
        return JSON.parse(fromFence) as unknown;
      } catch {
        /* 继续尝试宽松提取 */
      }
    }
    const raw = extractFencedOrRawJson(t);
    if (raw) return JSON.parse(raw) as unknown;
    throw new Error("LLM output is not valid JSON");
  }
}

function extractFencedOrRawJson(s: string): string | null {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (m?.[1]?.trim()) return m[1]!.trim();
  const i = s.indexOf("{");
  if (i >= 0) {
    const j = s.lastIndexOf("}");
    if (j > i) return s.slice(i, j + 1);
  }
  return null;
}

function isBand(x: string): x is CheckinReviewBand {
  return x === "low" || x === "mid" || x === "high";
}

function isDimId(x: string): x is CheckinReviewDimension["id"] {
  return x === "relevance" || x === "evidence" || x === "substance";
}

function buildReviewFromLlmParsed(parsed: unknown): {
  pass: boolean;
  review: CheckinPublicReview;
  internalOverall: number;
} | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as {
    passed?: unknown;
    summary?: unknown;
    dimensions?: unknown;
  };
  if (typeof p.passed !== "boolean") return null;
  if (typeof p.summary !== "string" || !p.summary.trim()) return null;
  if (!Array.isArray(p.dimensions)) return null;
  const byId = new Map<CheckinReviewDimension["id"], { band: CheckinReviewBand; hint: string }>();
  for (const row of p.dimensions) {
    if (!row || typeof row !== "object") return null;
    const r = row as { id?: unknown; band?: unknown; hint?: unknown };
    if (typeof r.id !== "string" || typeof r.band !== "string" || typeof r.hint !== "string")
      return null;
    if (!isDimId(r.id) || !isBand(r.band)) return null;
    const rawHint = r.hint.trim().slice(0, 200);
    const hint =
      rawHint.length > 0 ? rawHint : dimensionHints(r.id, r.band);
    byId.set(r.id, { band: r.band, hint });
  }
  if (byId.size !== 3) return null;
  for (const id of ORDER) {
    if (!byId.has(id)) return null;
  }
  const dimensions: CheckinReviewDimension[] = ORDER.map((id) => {
    const row = byId.get(id)!;
    return {
      id,
      label: LABEL[id],
      band: row.band,
      hint: row.hint,
    };
  });
  const scores = dimensions.map((d) => bandToScore(d.band));
  const internalOverall = Math.round(
    scores[0]! * 0.35 + scores[1]! * 0.35 + scores[2]! * 0.3,
  );
  return {
    pass: p.passed,
    review: { passed: p.passed, dimensions, summary: p.summary.trim() },
    internalOverall,
  };
}

async function evaluateCheckinWithDeepseek(input: {
  slot: CheckinSlot;
  userContent: string;
  attachmentCount: number;
  attachmentMeta: CheckinAttachmentMeta[];
}): Promise<{ pass: boolean; review: CheckinPublicReview; internalOverall: number }> {
  const task = input.slot.content?.trim() || input.slot.generatedContent?.trim() || "";
  const spec: CheckinSpec =
    input.slot.checkinSpec ?? deriveCheckinSpecFromSlotContent(task);

  const payload = {
    slotContent: task,
    checkinSpec: spec,
    userCompletionText: input.userContent.trim(),
    attachmentCount: input.attachmentCount,
    /** 仅元信息；模型不得声称已「阅读」文件内容 */
    attachments: input.attachmentMeta.map((a) => ({
      kind: a.kind,
      fileName: a.fileName ?? null,
    })),
  };

  const system = `你是「计划大师」的打卡完成证明审核员。根据「本期计划正文」「验收标准 checkinSpec」以及用户填写的完成说明、附件元数据（仅类型与文件名，你并未看到文件内容）判断是否允许正式提交。

**宽严原则（重要）**：计划中列举的多个关键词、术语或步骤，只要用户在说明里用**同义表述、中英文对应、分条解释**等方式能看出已覆盖，即视为满足，**不得**要求与计划原文逐字一致；**不得**因「少写了一个连接词」或「术语顺序不同」判不通过。仅当说明明显空洞、与本期任务无关、或明显整段复制计划而无自主内容时，才将 passed 设为 false。

你必须只输出**一个** JSON 对象，不要其它文字、不要用 markdown 代码块包裹。结构严格如下（字段名与 dimensions[].id 不可变）：
{"passed":boolean,"summary":"一句中文总评，说明是否可提交、原因要点","dimensions":[
  {"id":"relevance","band":"low|mid|high","hint":"一句中文，指出与本期任务关系是否说清，≤100字"},
  {"id":"evidence","band":"low|mid|high","hint":"从说明长度与附件元数据判断可核验性，≤100字"},
  {"id":"substance","band":"low|mid|high","hint":"是否具体、是否可能仅复制计划，≤100字"}
]}

band 含义：low=偏低，mid=一般，high=良好。passed 为 true 表示达到可提交标准；为 false 表示不通过。不得编造用户未提供的事实。`;

  const userMsg = `请审核以下数据（JSON）：\n${JSON.stringify(payload, null, 2)}`;

  const raw = await completeDeepseekChat(
    [
      { role: "system", content: system },
      { role: "user", content: userMsg },
    ],
    { temperature: 0.25 },
  );

  let parsed: unknown;
  try {
    parsed = parseJsonFromLlmText(raw);
  } catch {
    return evaluateCheckinSubmissionHeuristic({
      slot: input.slot,
      userContent: input.userContent,
      attachmentCount: input.attachmentCount,
    });
  }

  const built = buildReviewFromLlmParsed(parsed);
  if (!built) {
    return evaluateCheckinSubmissionHeuristic({
      slot: input.slot,
      userContent: input.userContent,
      attachmentCount: input.attachmentCount,
    });
  }
  return built;
}

/**
 * 打卡核验：已配置 DEEPSEEK 时走大模型，否则与单元测试环境均走启发式。
 */
export async function evaluateCheckinSubmission(input: {
  slot: CheckinSlot;
  userContent: string;
  attachmentCount: number;
  attachmentMeta?: CheckinAttachmentMeta[];
}): Promise<{ pass: boolean; review: CheckinPublicReview; internalOverall: number }> {
  const meta = input.attachmentMeta ?? [];
  if (!isDeepseekConfigured()) {
    return evaluateCheckinSubmissionHeuristic({
      slot: input.slot,
      userContent: input.userContent,
      attachmentCount: input.attachmentCount,
    });
  }
  try {
    return await evaluateCheckinWithDeepseek({
      slot: input.slot,
      userContent: input.userContent,
      attachmentCount: input.attachmentCount,
      attachmentMeta: meta,
    });
  } catch (e) {
    console.error("[checkin] DeepSeek review failed, fallback to heuristic:", e);
    return evaluateCheckinSubmissionHeuristic({
      slot: input.slot,
      userContent: input.userContent,
      attachmentCount: input.attachmentCount,
    });
  }
}
