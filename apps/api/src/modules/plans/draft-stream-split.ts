/**
 * 草稿流式输出拆分：模型仍输出「正文 + ```json 代码块」整段，但 SSE 只向客户端推送正文增量，
 * 避免 JSON 协议在页面上打字显示。
 *
 * 规则：
 * - 一旦出现 ```json（大小写不敏感），其后的内容均视为协议区，不向 UI 推送。
 * - 流式过程中若末尾可能是 ```json 的前缀（如单个反引号），暂不展示该后缀，避免闪烁。
 * - 兜底：若模型未写围栏直接输出换行后的 {"schedule":，也从该处截断展示。
 */

const FENCE = '```json';

/** 计算当前累积文本中「允许展示给用户」的前缀（不含 JSON 协议区） */
export function humanVisiblePrefix(accum: string): string {
  if (!accum) return '';
  const lower = accum.toLowerCase();
  const fenceIdx = lower.indexOf(FENCE);
  if (fenceIdx >= 0) {
    return accum.slice(0, fenceIdx).trimEnd();
  }

  // 无围栏时，模型若直接输出 { "schedule": …（行首或换行后）
  const rawJson = /(^|\n)\s*\{\s*"schedule"\s*:/m.exec(accum);
  if (rawJson && rawJson.index !== undefined) {
    return accum.slice(0, rawJson.index).trimEnd();
  }

  // 末尾可能是 ```json 的前几个字符，暂不展示以免把反引号闪现在正文里
  const n = accum.length;
  const maxK = Math.min(FENCE.length - 1, n);
  for (let k = maxK; k >= 1; k--) {
    if (FENCE.slice(0, k).toLowerCase() === lower.slice(n - k)) {
      return accum.slice(0, n - k);
    }
  }

  return accum;
}

export type DraftStreamAddChunkResult = {
  /** 可推给前端的正文增量（仍不含 JSON 区） */
  deltaText: string;
  /**
   * 自本次 chunk 起，累积内容已进入「仅协议/JSON」阶段（正文可见长度不再增长）。
   * 同一流内仅首次为 true，供前端在「正文流结束 ~ JSON 落库前」展示打卡表骨架。
   */
  scheduleJsonStarted: boolean;
};

export type DraftStreamSplitter = {
  addChunk(chunk: string): DraftStreamAddChunkResult;
  /** 完整模型输出（含 JSON），供落库 */
  getFull(): string;
};

export function createDraftStreamSplitter(): DraftStreamSplitter {
  let full = '';
  let lastVisibleLen = 0;
  let scheduleJsonStartedEmitted = false;
  return {
    addChunk(chunk: string) {
      if (!chunk) {
        return { deltaText: '', scheduleJsonStarted: false };
      }
      full += chunk;
      const visible = humanVisiblePrefix(full);
      const newVisibleLen = visible.length;
      const deltaText =
        newVisibleLen > lastVisibleLen ? visible.slice(lastVisibleLen, newVisibleLen) : '';
      const scheduleJsonStarted =
        !scheduleJsonStartedEmitted &&
        full.length > newVisibleLen &&
        newVisibleLen === lastVisibleLen;
      if (scheduleJsonStarted) scheduleJsonStartedEmitted = true;
      lastVisibleLen = newVisibleLen;
      return { deltaText, scheduleJsonStarted };
    },
    getFull() {
      return full;
    },
  };
}
