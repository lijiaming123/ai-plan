import type { ScheduleGranularity } from './plan.service';

/** 打卡判分用的结构化标准（可由模型生成，也可由系统从 content 派生） */
export type CheckinSpec = {
  criteria: string[];
  evidenceHint?: string;
};

export type CheckinSlot = {
  slotKey: string;
  /** 系统生成/模型生成的原始内容（用于“恢复为生成内容”） */
  generatedContent: string;
  /** 用户最终内容（默认=generatedContent，可编辑覆盖） */
  content: string;
  /** 当前 content 的来源 */
  contentSource: 'generated' | 'edited';
  editedAt?: string;
  editedByUserId?: string;
  /** 可选：明确打卡验收口径；缺省时由 deriveCheckinSpecFromSlotContent(content) 派生 */
  checkinSpec?: CheckinSpec;
};

export type CheckinSchedule = {
  granularity: ScheduleGranularity;
  /**
   * 可选：用于前端做「当前周」等定位（不改变 slotKey 语义，向后兼容旧数据）。
   * - startDate/endDate 均为 ISO 字符串（通常为 00:00:00Z 的日期）。
   */
  meta?: { startDate: string; endDate: string };
  slots: CheckinSlot[];
};

function stripEdgeBrackets(s: string): string {
  return s.replace(/^[（(\[【]/g, '').replace(/[）)\]】]$/g, '').trim();
}

/** 将「…（A、B、C）…」拆成可独立核验的要点，避免要求用户整段复制括号内原文 */
function expandSegmentIntoCriteria(segment: string): string[] {
  const s = segment.trim();
  if (s.length < 4) return [];

  const paren = s.match(/^(.+?)（([^）]+)）(.*)$/);
  if (paren && /、/.test(paren[2]!)) {
    const prefix = stripEdgeBrackets(paren[1]!.trim());
    const terms = paren[2]!
      .split(/、+/g)
      .map((x) => stripEdgeBrackets(x.trim()))
      .filter((x) => x.length >= 1 && x.length <= 64);
    const suffix = stripEdgeBrackets(paren[3]!.trim());
    const out: string[] = [];
    if (prefix.length >= 4) out.push(prefix);
    out.push(...terms);
    if (suffix.length >= 4) out.push(suffix);
    if (out.length >= 2) return out.slice(0, 8);
  }

  const parenEn = s.match(/^(.+?)\(([^)]+)\)(.*)$/);
  if (parenEn && /[,，]/.test(parenEn[2]!)) {
    const prefix = stripEdgeBrackets(parenEn[1]!.trim());
    const terms = parenEn[2]!
      .split(/[,，、]+/g)
      .map((x) => stripEdgeBrackets(x.trim()))
      .filter((x) => x.length >= 1 && x.length <= 64);
    const suffix = stripEdgeBrackets(parenEn[3]!.trim());
    const out: string[] = [];
    if (prefix.length >= 4) out.push(prefix);
    out.push(...terms);
    if (suffix.length >= 4) out.push(suffix);
    if (out.length >= 2) return out.slice(0, 8);
  }

  if (/、/.test(s) && s.length > 14) {
    const pieces = s
      .split(/、+/g)
      .map((x) => stripEdgeBrackets(x.trim()))
      .filter((x) => x.length >= 2 && x.length <= 80);
    if (pieces.length >= 2) return pieces.slice(0, 8);
  }
  return [s];
}

export function deriveCheckinSpecFromSlotContent(content: string): CheckinSpec {
  const raw = (content ?? '').trim();
  const coarse = raw
    .split(/[。.;；!！?？\n\r，,]+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 4);
  const criteria: string[] = [];
  for (const seg of coarse.slice(0, 6)) {
    for (const c of expandSegmentIntoCriteria(seg)) {
      if (!criteria.includes(c)) criteria.push(c);
      if (criteria.length >= 8) break;
    }
    if (criteria.length >= 8) break;
  }
  const finalCriteria =
    criteria.length > 0
      ? criteria
      : [
          raw.slice(0, 160).trim() ||
            '按计划完成本期任务，并提交可核验说明或附件。',
        ];
  return {
    criteria: finalCriteria,
    evidenceHint:
      '建议上传截图、文档或学习笔记链接；文字说明写清「做了什么、产出是什么」。同义表述、中英文对应、分条解释均可，不必逐字复述计划原文；列举的多个要点能整体覆盖即可。',
  };
}

function normalizeOptionalCheckinSpec(
  raw: unknown,
  fallbackContent: string,
): CheckinSpec {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const c = (raw as { criteria?: unknown }).criteria;
    if (Array.isArray(c) && c.length > 0) {
      const criteria = c
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((x) => x.trim())
        .slice(0, 8);
      if (criteria.length > 0) {
        const eh = (raw as { evidenceHint?: unknown }).evidenceHint;
        const base =
          typeof eh === 'string' && eh.trim()
            ? eh.trim().slice(0, 500)
            : undefined;
        const soften =
          ' 同义表述与分条说明可接受，不必逐字复述计划；列举要点能整体覆盖即可。';
        const evidenceHint = base
          ? `${base}${criteria.length > 3 ? soften : ''}`.slice(0, 500)
          : undefined;
        return { criteria, evidenceHint };
      }
    }
  }
  return deriveCheckinSpecFromSlotContent(fallbackContent);
}

/** 提取文本中最后一个 ```json ... ``` 代码块（返回块内内容），找不到则返回 null */
export function extractLastJsonCodeBlock(text: string): string | null {
  if (typeof text !== 'string') return null;
  // 用全局正则取最后一个 fenced block；允许 ```json 或 ```JSON
  const re = /```json\s*([\s\S]*?)\s*```/gi;
  let m: RegExpExecArray | null = null;
  let last: string | null = null;
  while ((m = re.exec(text)) !== null) {
    const body = m[1];
    if (typeof body === 'string' && body.trim()) last = body.trim();
  }
  return last;
}

/** 去掉文本中最后一个 ```json ...```（含围栏），用于落库时只保留正文展示 */
export function stripLastJsonCodeBlock(text: string): string {
  if (typeof text !== 'string' || !text) return '';
  const re = /```json\s*[\s\S]*?\s*```/gi;
  let m: RegExpExecArray | null = null;
  let last: { start: number; end: number } | null = null;
  while ((m = re.exec(text)) !== null) {
    last = { start: m.index, end: m.index + m[0].length };
  }
  if (!last) return text.trim();
  const next = `${text.slice(0, last.start)}\n\n${text.slice(last.end)}`.trim();
  return next;
}

type ParsedScheduleWire = {
  schedule?: {
    granularity?: unknown;
    slots?: unknown;
  };
};

function normalizeScheduleSlotContent(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .trim();
}

export function parseScheduleWireOrNull(jsonText: string): {
  granularity: ScheduleGranularity;
  slots: Array<{ slotKey: string; content: string; checkinSpec?: unknown }>;
} | null {
  if (!jsonText || typeof jsonText !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    return null;
  }
  const wire = parsed as ParsedScheduleWire;
  const schedule = wire?.schedule;
  if (!schedule || typeof schedule !== 'object') return null;
  const g = (schedule as { granularity?: unknown }).granularity;
  if (g !== 'day' && g !== 'week') return null;
  const slots = (schedule as { slots?: unknown }).slots;
  if (!Array.isArray(slots)) return null;
  const out: Array<{ slotKey: string; content: string; checkinSpec?: unknown }> = [];
  for (const item of slots) {
    if (!item || typeof item !== 'object') return null;
    const slotKey = (item as { slotKey?: unknown }).slotKey;
    const content = (item as { content?: unknown }).content;
    if (typeof slotKey !== 'string' || !slotKey.trim()) return null;
    if (typeof content !== 'string') return null;
    const normalizedContent = normalizeScheduleSlotContent(content);
    if (!normalizedContent) return null;
    const row: { slotKey: string; content: string; checkinSpec?: unknown } = {
      slotKey: slotKey.trim(),
      content: normalizedContent,
    };
    if ('checkinSpec' in item) row.checkinSpec = (item as { checkinSpec?: unknown }).checkinSpec;
    out.push(row);
  }
  return { granularity: g, slots: out };
}

export function validateScheduleStrict(params: {
  expectedGranularity: ScheduleGranularity;
  expectedSlotKeys: string[];
  wire: {
    granularity: ScheduleGranularity;
    slots: Array<{ slotKey: string; content: string; checkinSpec?: unknown }>;
  };
}): { ok: true; schedule: CheckinSchedule } | { ok: false; reason: string } {
  if (params.wire.granularity !== params.expectedGranularity) {
    return { ok: false, reason: 'granularity mismatch' };
  }
  if (params.wire.slots.length !== params.expectedSlotKeys.length) {
    return { ok: false, reason: 'slot length mismatch' };
  }
  for (let i = 0; i < params.expectedSlotKeys.length; i += 1) {
    const expected = params.expectedSlotKeys[i]!;
    const got = params.wire.slots[i];
    if (!got || got.slotKey !== expected) {
      return { ok: false, reason: 'slotKey mismatch' };
    }
    if (!got.content.trim()) return { ok: false, reason: 'empty content' };
  }
  return {
    ok: true,
    schedule: {
      granularity: params.expectedGranularity,
      slots: params.wire.slots.map((s) => {
        const spec = normalizeOptionalCheckinSpec(s.checkinSpec, s.content.trim());
        return {
          slotKey: s.slotKey,
          generatedContent: s.content,
          content: s.content,
          contentSource: 'generated' as const,
          checkinSpec: spec,
        };
      }),
    },
  };
}

export function buildFallbackSchedule(params: { granularity: ScheduleGranularity; slotKeys: string[] }): CheckinSchedule {
  const generatedContent =
    params.granularity === 'day'
      ? '今日重点：围绕目标推进 1 个可验证动作。完成后记录证据。'
      : '本周目标：完成 1 个里程碑 + 复盘 1 次。';
  return {
    granularity: params.granularity,
    slots: params.slotKeys.map((slotKey) => ({
      slotKey,
      generatedContent,
      content: generatedContent,
      contentSource: 'generated' as const,
      checkinSpec: deriveCheckinSpecFromSlotContent(generatedContent),
    })),
  };
}

