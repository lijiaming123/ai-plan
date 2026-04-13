import type { ScheduleGranularity } from './plan.service';

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
};

export type CheckinSchedule = {
  granularity: ScheduleGranularity;
  slots: CheckinSlot[];
};

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

export function parseScheduleWireOrNull(jsonText: string): { granularity: ScheduleGranularity; slots: Array<{ slotKey: string; content: string }> } | null {
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
  const out: Array<{ slotKey: string; content: string }> = [];
  for (const item of slots) {
    if (!item || typeof item !== 'object') return null;
    const slotKey = (item as { slotKey?: unknown }).slotKey;
    const content = (item as { content?: unknown }).content;
    if (typeof slotKey !== 'string' || !slotKey.trim()) return null;
    if (typeof content !== 'string' || !content.trim()) return null;
    out.push({ slotKey: slotKey.trim(), content: content.trim() });
  }
  return { granularity: g, slots: out };
}

export function validateScheduleStrict(params: {
  expectedGranularity: ScheduleGranularity;
  expectedSlotKeys: string[];
  wire: { granularity: ScheduleGranularity; slots: Array<{ slotKey: string; content: string }> };
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
      slots: params.wire.slots.map((s) => ({
        slotKey: s.slotKey,
        generatedContent: s.content,
        content: s.content,
        contentSource: 'generated' as const,
      })),
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
    })),
  };
}

