/**
 * 计划列表卡片：把 requirement 草稿里常见的 Markdown / 结构化前缀
 * 收成适合封面一行与简介多行的纯文本。
 */

export function stripMarkdownToPlain(raw: string): string {
  let t = (raw ?? "").trim();
  if (!t) return "";
  t = t.replace(/```[\s\S]*?```/g, " ");
  t = t.replace(/~~~[\s\S]*?~~~/g, " ");
  t = t.replace(/\x60([^\x60\n]*)\x60/g, "$1");
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  t = t.replace(/^[ \t]*#{1,6}\s+/gm, "");
  t = t.replace(/^\s*([-*+]|\d+\.)\s+/gm, "");
  t = t.replace(/\*{1,}/g, "");
  t = t.replace(/_{1,}/g, "");
  t = t.replace(/~~/g, "");
  t = t.replace(/^\s*-{3,}\s*$/gm, " ");
  t = t.replace(/<[^>]+>/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

/** 去掉「场景判断 / 类型 / 依据」等常见脚手架前缀（多轮，避免粘连） */
export function trimRequirementScaffoldPrefix(s: string): string {
  let t = s.trim();
  for (let i = 0; i < 12; i++) {
    const before = t;
    t = t
      .replace(/^场景判断\s*类型\s*[：:]\s*/i, "")
      .replace(/^场景判断\s*[：:]\s*/i, "")
      .replace(/^类型\s*[：:]\s*/i, "")
      .replace(/^依据\s*[：:]\s*/i, "")
      .replace(/^计划场景\s*[：:]\s*/i, "")
      .trim();
    if (t === before) break;
  }
  return t;
}

/** 若前半段仍是元信息，尽量从「用户…」起展示 */
export function preferUserFacingPortion(s: string): string {
  const t = s.trim();
  if (!t) return "";
  const u = t.indexOf("用户");
  if (u > 0 && u <= 96) return t.slice(u).trim();
  return t;
}

export function cardReadableRequirement(raw: string): string {
  let s = stripMarkdownToPlain(raw);
  s = trimRequirementScaffoldPrefix(s);
  s = preferUserFacingPortion(s);
  return s.trim();
}

const TYPE_COVER_FALLBACK: Record<string, string> = {
  study: "学习成长类计划",
  work: "工作项目类计划",
  exam: "备考复习类计划",
  fitness: "运动健康类计划",
  general: "综合类计划",
  other: "个人计划",
};

export function typeCoverFallback(type: string): string {
  const k = String(type ?? "")
    .trim()
    .toLowerCase();
  return TYPE_COVER_FALLBACK[k] ?? "个人计划";
}

export function truncatePlain(s: string, max: number): string {
  const t = s.trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/** 封面：优先第一句（到句号），否则截断 */
export function coverLineFromReadable(
  readable: string,
  type: string,
  goal: string,
  maxLen = 40,
): string {
  const r = readable.trim();
  const g = (goal ?? "").trim();
  const source = r || g || typeCoverFallback(type);
  const dot = source.indexOf("。");
  let line =
    dot >= 10 && dot <= 140 ? source.slice(0, dot + 1) : source;
  line = line.replace(/\s+/g, " ").trim();
  if (!line) line = typeCoverFallback(type);
  return truncatePlain(line, maxLen);
}

export function descriptionFromReadable(
  readable: string,
  goal: string,
  max = 160,
): string {
  const r = readable.trim();
  const g = (goal ?? "").trim();
  const primary = r || g;
  if (!primary) return "暂无描述";
  return truncatePlain(primary, max);
}

export function buildPlanCardDisplayTexts(input: {
  requirement: string;
  type: string;
  goal: string;
}): { description: string; coverLine: string } {
  const readable = cardReadableRequirement(input.requirement);
  return {
    description: descriptionFromReadable(readable, input.goal, 160),
    coverLine: coverLineFromReadable(readable, input.type, input.goal, 40),
  };
}
