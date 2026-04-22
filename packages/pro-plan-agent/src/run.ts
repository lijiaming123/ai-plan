import type {
  CheckinSpec,
  LlmLike,
  ProAgentInput,
  ProAgentRunResult,
  ProOption,
  ReviewIssue,
  ReviewResult,
  Schedule,
  ScheduleGranularity,
  ScheduleWire,
} from "./types";

export async function runProPlanAgent(_params: {
  input: ProAgentInput;
  llm: LlmLike;
}): Promise<ProAgentRunResult> {
  const { input, llm } = _params;

  const normalized = normalizeInput(input);
  const { expectedGranularity, slotKeys } = buildExpectedSchedule(normalized);

  const cacheKey = buildCacheKey("draft", normalized);
  const raw = (
    await llm.complete({
      task: "pro_plan_draft",
      cacheKey,
      messages: buildDraftMessages(normalized, expectedGranularity, slotKeys),
    })
  ).text;

  const {
    suggestedContent: draftContent,
    schedule,
    assumptions,
  } = parseDraftOutput({
    raw,
    expectedGranularity,
    slotKeys,
    fallbackHint:
      normalized.mode === "draft"
        ? buildLocalDraftText(normalized)
        : normalized.requirement,
  });

  const review = reviewExecutability({
    goal: normalized.goal,
    requirement: normalized.requirement,
    suggestedContent: draftContent,
    schedule,
  });

  const revised = autoRevise({
    goal: normalized.goal,
    startDate: normalized.startDate,
    endDate: normalized.endDate,
    original: draftContent,
    review,
    schedule,
  });

  const options = buildOptions();

  return {
    draft: {
      reply: "已生成计划初稿，并完成自动评审与优化（专业版）。",
      suggestedContent: draftContent,
      schedule,
      assumptions,
    },
    review,
    revised,
    options,
  };
}

function normalizeInput(input: ProAgentInput): ProAgentInput {
  const trim = (s: string) =>
    typeof s === "string" ? s.replace(/\u0000/g, "").trim() : "";
  return {
    ...input,
    goal: trim(input.goal),
    requirement:
      typeof input.requirement === "string"
        ? input.requirement.replace(/\u0000/g, "").trim()
        : "",
    startDate: trim(input.startDate),
    endDate: trim(input.endDate),
    cycle: trim(input.cycle),
    message: input.message ? trim(input.message) : undefined,
  };
}

function toIsoStart(ymd: string): string {
  return new Date(`${ymd}T00:00:00.000Z`).toISOString();
}

function daysBetweenInclusive(startIso: string, endIso: string): number {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const ms = end.getTime() - start.getTime();
  const days = Math.floor(ms / 86_400_000);
  return Math.max(1, days + 1);
}

function decideScheduleGranularity(
  mode: ProAgentInput["granularityMode"],
  startIso: string,
  endIso: string,
): ScheduleGranularity {
  if (mode === "deep") return "day";
  if (mode === "rough") return "week";
  const duration = daysBetweenInclusive(startIso, endIso);
  return duration <= 92 ? "day" : "week";
}

function buildSlotKeys(
  granularity: ScheduleGranularity,
  startIso: string,
  endIso: string,
): string[] {
  const duration = daysBetweenInclusive(startIso, endIso);
  if (granularity === "week") {
    const weeks = Math.max(1, Math.ceil(duration / 7));
    return Array.from({ length: weeks }, (_, i) => `W${i + 1}`);
  }
  const start = new Date(startIso);
  const keys: string[] = [];
  for (let i = 0; i < duration; i += 1) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const y = d.getUTCFullYear();
    const m = `${d.getUTCMonth() + 1}`.padStart(2, "0");
    const day = `${d.getUTCDate()}`.padStart(2, "0");
    keys.push(`${y}-${m}-${day}`);
  }
  return keys;
}

function buildExpectedSchedule(input: ProAgentInput): {
  expectedGranularity: ScheduleGranularity;
  slotKeys: string[];
} {
  const startIso = toIsoStart(input.startDate);
  const endIso = toIsoStart(input.endDate);
  const expectedGranularity = decideScheduleGranularity(
    input.granularityMode ?? "smart",
    startIso,
    endIso,
  );
  const slotKeys = buildSlotKeys(expectedGranularity, startIso, endIso);
  return { expectedGranularity, slotKeys };
}

function buildDraftMessages(
  input: ProAgentInput,
  expectedGranularity: ScheduleGranularity,
  slotKeys: string[],
) {
  const baseRequirement =
    input.requirement.trim().length > 0
      ? input.requirement
      : `请根据以下目标生成计划：${input.goal}`;
  const userContent = [
    `目标：${input.goal}`,
    `起始：${input.startDate}，预计完成：${input.endDate}，周期代码：${input.cycle}`,
    "",
    `补充说明：`,
    baseRequirement,
    "",
    `请输出两部分：`,
    `1) 可直接保存为「计划内容」的中文正文：务实、可执行、按阶段/按周组织；每个阶段给出验收证据；列出风险与应对；最后给出复盘建议；`,
    `2) 在最后输出一个严格的 JSON 代码块（\`\`\`json ...\`\`\`），仅包含如下结构：`,
    `{`,
    `  "schedule": {`,
    `    "granularity": "${expectedGranularity}",`,
    `    "slots": [`,
    `      { "slotKey": "...", "content": "...", "checkinSpec": { "criteria": ["..."], "evidenceHint": "..." } }`,
    `    ]`,
    `  }`,
    `}`,
    `注意：slotKey 必须严格来自下方「时间槽」列表，且顺序必须完全一致；content 为当期计划一段中文（1-3句，具体可执行，且包含可验收的“证据/产出”）。可选 checkinSpec：criteria 为 2-5 条可验收短句，evidenceHint 提示应提交何种证明。`,
    "",
    "时间槽：",
    ...slotKeys.map((k) => `- ${k}`),
  ].join("\n");
  return [
    {
      role: "system" as const,
      content:
        "你是「计划大师」专业版的 AI 执行教练。目标是让用户能按时完成：输出必须具体、可操作、可验收；避免空泛口号。",
    },
    { role: "user" as const, content: userContent },
  ];
}

function extractLastJsonCodeBlock(text: string): string | null {
  if (typeof text !== "string") return null;
  const re = /```json\s*([\s\S]*?)\s*```/gi;
  let m: RegExpExecArray | null = null;
  let last: string | null = null;
  while ((m = re.exec(text)) !== null) {
    const body = m[1];
    if (typeof body === "string" && body.trim()) last = body.trim();
  }
  return last;
}

function stripLastJsonCodeBlock(text: string): string {
  if (typeof text !== "string" || !text) return "";
  const re = /```json\s*[\s\S]*?\s*```/gi;
  let m: RegExpExecArray | null = null;
  let last: { start: number; end: number } | null = null;
  while ((m = re.exec(text)) !== null) {
    last = { start: m.index, end: m.index + m[0].length };
  }
  if (!last) return text.trim();
  return `${text.slice(0, last.start)}\n\n${text.slice(last.end)}`.trim();
}

function deriveCheckinSpecFromSlotContent(content: string): CheckinSpec {
  const raw = (content ?? "").trim();
  const segments = raw
    .split(/[。.;；!！?？\n\r]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4)
    .slice(0, 5);
  const criteria =
    segments.length > 0
      ? segments
      : [
          raw.slice(0, 160).trim() ||
            "按计划完成本期任务，并提交可核验说明或附件。",
        ];
  return {
    criteria,
    evidenceHint:
      "建议上传截图、文档或学习笔记链接；文字说明请写清「做了什么、产出是什么」，避免仅复制计划原文。",
  };
}

function normalizeOptionalCheckinSpec(
  raw: unknown,
  fallbackContent: string,
): CheckinSpec {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const c = (raw as { criteria?: unknown }).criteria;
    if (Array.isArray(c) && c.length > 0) {
      const criteria = c
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim())
        .slice(0, 8);
      if (criteria.length > 0) {
        const eh = (raw as { evidenceHint?: unknown }).evidenceHint;
        const evidenceHint =
          typeof eh === "string" && eh.trim()
            ? eh.trim().slice(0, 500)
            : undefined;
        return { criteria, evidenceHint };
      }
    }
  }
  return deriveCheckinSpecFromSlotContent(fallbackContent);
}

function parseScheduleWireOrNull(
  jsonText: string,
): ScheduleWire["schedule"] | null {
  if (!jsonText || typeof jsonText !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const schedule = (parsed as any).schedule;
  if (!schedule || typeof schedule !== "object") return null;
  const g = (schedule as any).granularity;
  if (g !== "day" && g !== "week") return null;
  const slots = (schedule as any).slots;
  if (!Array.isArray(slots)) return null;
  const out: Array<{
    slotKey: string;
    content: string;
    checkinSpec?: unknown;
  }> = [];
  for (const item of slots) {
    if (!item || typeof item !== "object") return null;
    const slotKey = (item as any).slotKey;
    const content = (item as any).content;
    if (typeof slotKey !== "string" || !slotKey.trim()) return null;
    if (typeof content !== "string" || !content.trim()) return null;
    const row: { slotKey: string; content: string; checkinSpec?: unknown } = {
      slotKey: slotKey.trim(),
      content: content.trim(),
    };
    if ("checkinSpec" in item) row.checkinSpec = (item as any).checkinSpec;
    out.push(row);
  }
  return { granularity: g, slots: out };
}

function validateScheduleStrict(params: {
  expectedGranularity: ScheduleGranularity;
  expectedSlotKeys: string[];
  wire: {
    granularity: ScheduleGranularity;
    slots: Array<{ slotKey: string; content: string; checkinSpec?: unknown }>;
  };
}): { ok: true; schedule: Schedule } | { ok: false; reason: string } {
  if (params.wire.granularity !== params.expectedGranularity)
    return { ok: false, reason: "granularity mismatch" };
  if (params.wire.slots.length !== params.expectedSlotKeys.length)
    return { ok: false, reason: "slot length mismatch" };
  for (let i = 0; i < params.expectedSlotKeys.length; i += 1) {
    const expected = params.expectedSlotKeys[i]!;
    const got = params.wire.slots[i];
    if (!got || got.slotKey !== expected)
      return { ok: false, reason: "slotKey mismatch" };
    if (!got.content.trim()) return { ok: false, reason: "empty content" };
  }
  return {
    ok: true,
    schedule: {
      granularity: params.expectedGranularity,
      slots: params.wire.slots.map((s) => ({
        slotKey: s.slotKey,
        generatedContent: s.content,
        content: s.content,
        contentSource: "generated" as const,
        checkinSpec: normalizeOptionalCheckinSpec(s.checkinSpec, s.content.trim()),
      })),
    },
  };
}

function buildFallbackSchedule(
  granularity: ScheduleGranularity,
  slotKeys: string[],
): Schedule {
  const generatedContent =
    granularity === "day"
      ? "今日重点：围绕目标推进 1 个可验证动作。完成后记录证据。"
      : "本周目标：完成 1 个里程碑 + 复盘 1 次。";
  const spec = deriveCheckinSpecFromSlotContent(generatedContent);
  return {
    granularity,
    slots: slotKeys.map((slotKey) => ({
      slotKey,
      generatedContent,
      content: generatedContent,
      contentSource: "generated" as const,
      checkinSpec: spec,
    })),
  };
}

function parseDraftOutput(params: {
  raw: string;
  expectedGranularity: ScheduleGranularity;
  slotKeys: string[];
  fallbackHint: string;
}): { suggestedContent: string; schedule: Schedule; assumptions: string[] } {
  const assumptions: string[] = [];
  const raw = (params.raw ?? "").trim();
  const jsonBlock = extractLastJsonCodeBlock(raw);
  const wire = jsonBlock ? parseScheduleWireOrNull(jsonBlock) : null;
  const validated = wire
    ? validateScheduleStrict({
        expectedGranularity: params.expectedGranularity,
        expectedSlotKeys: params.slotKeys,
        wire,
      })
    : ({ ok: false as const, reason: "missing json" } as const);
  const schedule = validated.ok
    ? validated.schedule
    : buildFallbackSchedule(params.expectedGranularity, params.slotKeys);
  const suggestedContent =
    (jsonBlock ? stripLastJsonCodeBlock(raw) : raw).trim() ||
    params.fallbackHint.trim();

  if (!jsonBlock)
    assumptions.push(
      "模型未返回严格 JSON 代码块，已使用本地打卡表骨架作为回退。",
    );
  if (!suggestedContent) assumptions.push("模型正文为空，已使用本地模板回退。");
  return { suggestedContent, schedule, assumptions };
}

function buildLocalDraftText(input: ProAgentInput): string {
  return [
    `目标：${input.goal}`,
    `起始时间：${input.startDate}`,
    `预计完成：${input.endDate}`,
    `周期：${input.cycle}`,
    "",
    "【阶段1：准备】",
    "  - 明确成功标准与验收证据",
    "  - 准备工具/资料清单并创建记录模板",
    "",
    "【阶段2：推进】",
    "  - 每周期完成 1 个可验证动作并记录证据",
    "  - 每周期复盘：完成/阻碍/下周调整",
    "",
    "【阶段3：收尾】",
    "  - 汇总证据与产出，形成复盘文档",
    "  - 固化下一轮行动清单",
  ].join("\n");
}

function reviewExecutability(params: {
  goal: string;
  requirement: string;
  suggestedContent: string;
  schedule: Schedule;
}): ReviewResult {
  const issues: ReviewIssue[] = [];

  const hasAcceptance = /验收|标准|通过|达成/.test(params.suggestedContent);
  const hasEvidence = /证据|产出|提交|记录|链接|截图|笔记/.test(
    params.suggestedContent,
  );
  const hasRisk = /风险|阻碍|应对|预案/.test(params.suggestedContent);
  const hasReview = /复盘|回顾|总结/.test(params.suggestedContent);

  if (!hasAcceptance) {
    issues.push({
      code: "missing_acceptance",
      severity: "high",
      title: "缺少明确验收标准",
      detail: "正文中没有清晰的“完成=什么样”的标准，容易变成空泛推进。",
      suggestion:
        "为每个阶段补一条可验证的验收标准（例如“输出一份X文档/完成Y次练习并留存记录”）。",
    });
  }
  if (!hasEvidence) {
    issues.push({
      code: "missing_evidence",
      severity: "high",
      title: "缺少可留存的证据/产出",
      detail: "没有要求记录证据会导致执行不可追踪，难以复盘与改进。",
      suggestion: "为每个周期增加“证据/产出”字段（链接/截图/笔记/提交记录）。",
    });
  }
  if (!hasRisk) {
    issues.push({
      code: "missing_risk",
      severity: "medium",
      title: "风险与应对不具体",
      detail: "缺少对常见阻碍的预案，会导致中途掉队。",
      suggestion: "列出 3 个高概率阻碍（时间/精力/资源）并给出可执行应对动作。",
    });
  }
  if (!hasReview) {
    issues.push({
      code: "other",
      severity: "low",
      title: "建议补充复盘机制",
      detail: "没有固定复盘节奏会降低持续改进效率。",
      suggestion: "每周/每周期末安排 10–20 分钟复盘：完成/阻碍/下周期调整。",
    });
  }

  // 可执行性权重最高：这里用简单规则打分（第一版先稳定，再逐步精细）
  const executability = clamp(
    100 -
      (hasAcceptance ? 0 : 25) -
      (hasEvidence ? 0 : 25) -
      (hasRisk ? 0 : 10) -
      (params.schedule.slots.length > 0 ? 0 : 20),
    0,
    100,
  );
  const clarity = clamp(
    90 -
      (params.suggestedContent.length < 60 ? 25 : 0) -
      (issues.some((i) => i.code === "too_vague") ? 20 : 0),
    0,
    100,
  );
  const riskControl = clamp(80 - (hasRisk ? 0 : 25), 0, 100);
  const rhythm = clamp(80 - (hasReview ? 0 : 15), 0, 100);

  const scoreTotal = clamp(
    Math.round(
      executability * 0.5 + clarity * 0.2 + riskControl * 0.15 + rhythm * 0.15,
    ),
    0,
    100,
  );
  const summary = issues.length
    ? `发现 ${issues.length} 个主要问题，已优先围绕“可执行/可验收”方向优化。`
    : "计划可执行性良好，建议按节奏推进并按期复盘。";

  return {
    scoreTotal,
    scoreBreakdown: {
      executability,
      clarity,
      riskControl,
      rhythm,
    },
    issues,
    summary,
  };
}

function autoRevise(params: {
  goal: string;
  startDate: string;
  endDate: string;
  original: string;
  review: ReviewResult;
  schedule: Schedule;
}): { suggestedContent: string; schedule: Schedule; diffSummary: string[] } {
  let content = params.original.trim();
  const diffs: string[] = [];

  const needAcceptance = params.review.issues.some(
    (i) => i.code === "missing_acceptance",
  );
  const needEvidence = params.review.issues.some(
    (i) => i.code === "missing_evidence",
  );
  const needRisk = params.review.issues.some((i) => i.code === "missing_risk");

  const blocks: string[] = [];
  if (needAcceptance) {
    blocks.push(
      "## 验收标准\n- 阶段性验收：每周至少产出 1 个可验证结果（文档/练习记录/提交截图）。\n- 最终验收：围绕目标输出一份“完成证据包”（链接/截图/笔记汇总）。",
    );
    diffs.push("补充「验收标准」区块");
  }
  if (needEvidence) {
    blocks.push(
      "## 证据与记录\n- 每个时间槽完成后记录：做了什么 → 产出/证据链接 → 下次改进点（1 句）。",
    );
    diffs.push("补充「证据与记录」区块");
  }
  if (needRisk) {
    blocks.push(
      "## 风险与应对\n- 时间不足：将当期任务缩减为“最小可验证动作”，优先保留证据记录。\n- 精力波动：将任务拆成 25 分钟番茄块，允许分两次完成。\n- 资料/方向不清：先做 30 分钟信息收集并形成 1 页笔记，再进入执行。",
    );
    diffs.push("补充「风险与应对」区块");
  }

  if (blocks.length) {
    content = `${content}\n\n${blocks.join("\n\n")}`.trim();
  }

  // schedule 第一版保持不改（只确保存在且严格）；后续可在 Apply Choice 阶段做 slot 内容微调
  return {
    suggestedContent: content,
    schedule: params.schedule,
    diffSummary: diffs.length ? diffs : ["无需结构性修改，仅建议按期复盘。"],
  };
}

function buildOptions(): ProOption[] {
  return [
    {
      id: "more_granular",
      title: "更细到天（更具体）",
      pros: ["每天都有明确动作与证据", "更容易坚持与复盘"],
      cons: ["计划更长、调整成本更高"],
      promptHint:
        "把每个周槽进一步细化为每日 1 个最小可验证动作，并保持证据记录。",
    },
    {
      id: "save_time",
      title: "更省时（更轻量）",
      pros: ["降低时间占用", "更适合忙碌期"],
      cons: ["进度可能更慢，需要更强自律"],
      promptHint:
        "将每个时间槽的动作压缩为 30–45 分钟内可完成的最小动作，保留证据记录。",
    },
    {
      id: "more_steady",
      title: "更稳（更抗波动）",
      pros: ["对精力波动更友好", "失败成本更低"],
      cons: ["冲刺能力略弱"],
      promptHint:
        "为每个时间槽添加“保底动作 + 加分动作”，保证最差情况下也能推进。",
    },
    {
      id: "more_aggressive",
      title: "更激进（更快达成）",
      pros: ["更强冲刺节奏", "更快出结果"],
      cons: ["更容易超载，需要更严格的时间预算"],
      promptHint:
        "在不超出时间预算前提下提高每周产出强度，并明确每周验收产物。",
    },
  ];
}

function buildCacheKey(phase: string, input: ProAgentInput): string {
  const base = JSON.stringify({
    phase,
    mode: input.mode,
    goal: input.goal,
    requirement: input.requirement,
    startDate: input.startDate,
    endDate: input.endDate,
    cycle: input.cycle,
    granularityMode: input.granularityMode ?? "",
    message: input.message ?? "",
  });
  // 低量级：用轻量 hash，避免 key 过长
  let h = 0;
  for (let i = 0; i < base.length; i += 1)
    h = (h * 31 + base.charCodeAt(i)) >>> 0;
  return `pro-plan-agent:${phase}:${h.toString(16)}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
