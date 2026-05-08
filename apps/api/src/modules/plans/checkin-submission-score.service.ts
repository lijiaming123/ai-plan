/**
 * 打卡完成证明：优先 DeepSeek 大模型审核；未配置或调用失败时回退启发式（与 tests 环境一致）。
 */
import { completeDeepseekChat, isDeepseekConfigured } from "../../lib/deepseek";
import type { CheckinSpec, CheckinSlot } from "./deepseek-schedule";
import {
  deriveCheckinSpecFromSlotContent,
  extractLastJsonCodeBlock,
} from "./deepseek-schedule";

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

const ORDER: CheckinReviewDimension["id"][] = [
  "relevance",
  "evidence",
  "substance",
];

function norm(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

function toBand(score: number): CheckinReviewBand {
  if (score < 38) return "low";
  if (score < 65) return "mid";
  return "high";
}

function stripEdgePunct(s: string): string {
  return s
    .replace(/^[（(\[【"'「]/g, "")
    .replace(/[）)\]」'"。]+$/, "")
    .trim();
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
  // 额外提取英文/缩写术语（RAG/Embedding/Retriever 等），避免被中文上下文粘连导致无法命中。
  const latin = combinedTaskText.match(/[A-Za-z]{2,}/g) ?? [];
  for (const t of latin) {
    const s = stripEdgePunct(t.trim());
    if (s.length >= 2 && s.length <= 32) out.push(s);
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
  // 仅凭“有附件”不应直接判定证据充分：附件内容不可见，且可能不相关。
  // 将附件作为加分项，但仍要求用户提供最低限度的文字说明来对齐本期任务。
  if (attachmentCount > 0) {
    if (textLen >= 60) return 88;
    if (textLen >= 25) return 78;
    if (textLen >= 10) return 74;
    return 66;
  }
  if (textLen >= 80) return 82;
  if (textLen >= 40) return 70;
  if (textLen >= 25) return 55;
  return Math.min(45, textLen * 2);
}

function scoreSubstance(
  task: string,
  user: string,
  attachmentCount: number,
): number {
  if (duplicateLike(task, user)) return 22;
  if (attachmentCount > 0 && user.trim().length < 8) return 52;
  if (user.trim().length >= 20) return 82;
  if (user.trim().length >= 10) return 62;
  return 48;
}

function requiresArtifactEvidence(task: string, spec: CheckinSpec): boolean {
  // 只对“明确要求产出”的任务启用更严格 gate。
  // 注意：deriveCheckinSpecFromSlotContent 可能生成泛化 evidenceHint（如“上传截图/链接”），
  // 这不等于任务“必须提供某类图”，因此这里不使用 evidenceHint 触发 gate。
  const combined = `${task}\n${spec.criteria.join("\n")}`.toLowerCase();
  return /(流程图|架构图|时序图|图示|示意图|diagram|flow|pipeline)/i.test(combined);
}

function dimensionHints(
  id: CheckinReviewDimension["id"],
  band: CheckinReviewBand,
): string {
  const hints: Record<
    CheckinReviewDimension["id"],
    Record<CheckinReviewBand, string>
  > = {
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
  attachmentExtractedText?: string;
}): { pass: boolean; review: CheckinPublicReview; internalOverall: number } {
  const task =
    input.slot.content?.trim() || input.slot.generatedContent?.trim() || "";
  const spec: CheckinSpec =
    input.slot.checkinSpec ?? deriveCheckinSpecFromSlotContent(task);
  const user = input.userContent.trim();
  const extracted = (input.attachmentExtractedText ?? "").trim();
  const n = input.attachmentCount;

  const combinedTaskText = [task, ...spec.criteria].join("。");
  let rel = tokenOverlapScore(combinedTaskText, user);
  if (extracted) {
    // 抽取文本（OCR/文档）里往往是英文术语或片段；用「仅 task」与「task+criteria」两种粒度取最大值，避免被大量中文 criteria 稀释命中率。
    rel = Math.max(rel, tokenOverlapScore(combinedTaskText, extracted));
    rel = Math.max(rel, tokenOverlapScore(task, extracted));
  }
  const needsArtifact = requiresArtifactEvidence(task, spec);
  // 普通任务：有附件时适度放宽相关性，减少“做了但写得简短”导致的假阴性。
  if (!needsArtifact && n > 0) rel = Math.max(rel, 58);
  const ev = scoreEvidence(user.length, n);
  const sub = scoreSubstance(task, user, n);

  let overall = Math.round(rel * 0.35 + ev * 0.35 + sub * 0.3);

  // 对“流程图/截图/图示”等需要可核验产物的任务更严格：不能只丢一张附件就通过。
  if (needsArtifact) {
    const extractedHasSignal = extracted
      ? expandOverlapFragments(task).some((p) => userCoversPart(extracted, p))
      : false;
    const tooShort = user.length < 20 && extracted.length < 30;
    const tooVague = rel < 52 && !extractedHasSignal; // 基本未对齐本期任务关键词/要点
    if (tooShort || tooVague) {
      overall = Math.min(overall, 49);
    }
  }

  /** 达线阈值：普通任务保持友好；产物型任务由上方 gate 兜底避免误判 */
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
  const byId = new Map<
    CheckinReviewDimension["id"],
    { band: CheckinReviewBand; hint: string }
  >();
  for (const row of p.dimensions) {
    if (!row || typeof row !== "object") return null;
    const r = row as { id?: unknown; band?: unknown; hint?: unknown };
    if (
      typeof r.id !== "string" ||
      typeof r.band !== "string" ||
      typeof r.hint !== "string"
    )
      return null;
    if (!isDimId(r.id) || !isBand(r.band)) return null;
    const rawHint = r.hint.trim().slice(0, 200);
    const hint = rawHint.length > 0 ? rawHint : dimensionHints(r.id, r.band);
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
  attachmentExtractedText?: string;
}): Promise<{ pass: boolean; review: CheckinPublicReview; internalOverall: number }> {
  const task = input.slot.content?.trim() || input.slot.generatedContent?.trim() || "";
  const spec: CheckinSpec =
    input.slot.checkinSpec ?? deriveCheckinSpecFromSlotContent(task);

  const payload = {
    slotContent: task,
    checkinSpec: spec,
    userCompletionText: input.userContent.trim(),
    attachmentCount: input.attachmentCount,
    attachmentExtractedText:
      (input.attachmentExtractedText ?? "").trim().slice(0, 3000) || null,
    /** 仅元信息；模型不得声称已「阅读」文件内容 */
    attachments: input.attachmentMeta.map((a) => ({
      kind: a.kind,
      fileName: a.fileName ?? null,
    })),
  };

  const system = `你是「计划大师」的打卡完成证明审核员。根据「本期计划正文」「验收标准 checkinSpec」以及用户填写的完成说明、附件元数据（仅类型与文件名，你并未看到文件内容）判断是否允许正式提交。

**宽严原则（重要）**：计划中列举的多个关键词、术语或步骤，只要用户在说明里用**同义表述、中英文对应、分条解释**等方式能看出已覆盖，即视为满足，**不得**要求与计划原文逐字一致；**不得**因「少写了一个连接词」或「术语顺序不同」判不通过。仅当说明明显空洞、与本期任务无关、或明显整段复制计划而无自主内容时，才将 passed 设为 false。

**反作弊与误判约束（重要）**：你并未看到附件内容，因此不得仅因“有附件”就判定证据充分或任务已完成。如果输入中提供了 attachmentExtractedText（OCR/抽取文本摘要），你可以把它当作“附件里可见的文字证据”，但仍需和本期任务/验收点对照。若本期任务明确要求“流程图/截图/图示”等产物，而用户完成说明过短、仅写“已上传/见附件”等泛化句，且 attachmentExtractedText 也无法体现关键术语/步骤，应将 passed 设为 false，并提示用户补充：做了什么、产物是什么、如何对应本期计划。

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
      attachmentExtractedText: input.attachmentExtractedText,
    });
  }

  const built = buildReviewFromLlmParsed(parsed);
  if (!built) {
    return evaluateCheckinSubmissionHeuristic({
      slot: input.slot,
      userContent: input.userContent,
      attachmentCount: input.attachmentCount,
      attachmentExtractedText: input.attachmentExtractedText,
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
  /** OCR/抽取后的附件文本摘要（可空）；用于辅助相关性判定 */
  attachmentExtractedText?: string;
}): Promise<{ pass: boolean; review: CheckinPublicReview; internalOverall: number }> {
  const meta = input.attachmentMeta ?? [];
  if (!isDeepseekConfigured()) {
    return evaluateCheckinSubmissionHeuristic({
      slot: input.slot,
      userContent: input.userContent,
      attachmentCount: input.attachmentCount,
      attachmentExtractedText: input.attachmentExtractedText,
    });
  }
  try {
    return await evaluateCheckinWithDeepseek({
      slot: input.slot,
      userContent: input.userContent,
      attachmentCount: input.attachmentCount,
      attachmentMeta: meta,
      attachmentExtractedText: input.attachmentExtractedText,
    });
  } catch (e) {
    console.error(
      "[checkin] DeepSeek review failed, fallback to heuristic:",
      e,
    );
    return evaluateCheckinSubmissionHeuristic({
      slot: input.slot,
      userContent: input.userContent,
      attachmentCount: input.attachmentCount,
      attachmentExtractedText: input.attachmentExtractedText,
    });
  }
}
