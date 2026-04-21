export type PendingDraftStreamPayload = {
  assistantPrompt: string;
  startDate: string;
  cycle: string;
  endDate: string;
  /**
   * 创建页「立即生成计划」时的 Tab：普通版需在草稿页对流式生成 v1；专业版若创建接口已写入完整 v1 则跳过流式避免覆盖。
   * 缺省按专业版逻辑处理（与 v1 有正文则跳过）兼容旧 session。
   */
  createTier?: 'basic' | 'pro';
};

export type PlanAssistantStreamBody = {
  mode: 'draft' | 'chat';
  goal: string;
  requirement: string;
  startDate: string;
  cycle: '1w' | '1m' | '3m' | '6m' | 'custom';
  endDate: string;
  granularityMode?: 'smart' | 'deep' | 'rough';
  message?: string;
  tier?: 'basic' | 'pro';
  agent?: 'basic' | 'pro';
};

const keyFor = (planId: string) => `ai-plan:draft-stream:${planId}`;

export function storeDraftStreamPayload(planId: string, payload: PendingDraftStreamPayload) {
  sessionStorage.setItem(keyFor(planId), JSON.stringify(payload));
}

export function peekDraftStreamPayload(planId: string): PendingDraftStreamPayload | null {
  const raw = sessionStorage.getItem(keyFor(planId));
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<PendingDraftStreamPayload>;
    if (
      typeof o.assistantPrompt === 'string' &&
      typeof o.startDate === 'string' &&
      typeof o.cycle === 'string' &&
      typeof o.endDate === 'string'
    ) {
      return o as PendingDraftStreamPayload;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearDraftStreamPayload(planId: string) {
  sessionStorage.removeItem(keyFor(planId));
}

/** 读取并删除（一次性消费）。草稿页优先用 peek + 在确认发起流式请求后再 clear，避免竞态丢载荷。 */
export function readAndClearDraftStreamPayload(planId: string): PendingDraftStreamPayload | null {
  const p = peekDraftStreamPayload(planId);
  if (p) clearDraftStreamPayload(planId);
  return p;
}

/** SSE：`delta_text`（仅正文）、`body_complete`（正文结束进入 JSON 区）、`done` / `error`；兼容旧 `delta`。 */

function buildAssistantStreamUrl(baseURL: string, planId: string): string {
  const path = `/plans/${encodeURIComponent(planId)}/assistant-draft-stream`;
  const b = baseURL.replace(/\/$/, '').trim();
  if (!b) return path;
  return `${b}${path}`;
}

function buildRegenerateStreamUrl(baseURL: string, planId: string): string {
  const path = `/plans/${encodeURIComponent(planId)}/regenerate-stream`;
  const b = baseURL.replace(/\/$/, '').trim();
  if (!b) return path;
  return `${b}${path}`;
}

export type RegenerateStreamBody = {
  requirement?: string;
  granularityMode?: 'smart' | 'deep' | 'rough';
};

/** SSE：与 assistant-draft-stream 相同事件格式，用于再生成新版本时边生成边展示 */
export async function consumeRegenerateDraftStream(
  baseURL: string,
  planId: string,
  token: string,
  body: RegenerateStreamBody,
  handlers: {
    onDelta: (t: string) => void;
    onBodyComplete?: () => void;
    onDone: () => void;
    onError: (msg: string) => void;
  },
): Promise<void> {
  const url = buildRegenerateStreamUrl(baseURL, planId);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { message?: string };
      if (j.message) msg = j.message;
    } catch {
      /* keep msg */
    }
    handlers.onError(msg);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    handlers.onError('无法读取流式响应');
    return;
  }

  const decoder = new TextDecoder();
  let carry = '';
  let sawDone = false;
  let aborted = false;

  const processLine = (line: string) => {
    if (aborted) return;
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const jsonStr = trimmed.replace(/^data:\s*/i, '').trim();
    if (!jsonStr || jsonStr === '[DONE]') return;
    try {
      const ev = JSON.parse(jsonStr) as {
        type?: string;
        text?: string;
        message?: string;
        ok?: boolean;
      };
      if (
        (ev.type === 'delta_text' || ev.type === 'delta') &&
        typeof ev.text === 'string'
      ) {
        handlers.onDelta(ev.text);
      } else if (ev.type === 'body_complete') {
        handlers.onBodyComplete?.();
      } else if (ev.type === 'done' && ev.ok === true) {
        sawDone = true;
        handlers.onDone();
      } else if (ev.type === 'error') {
        aborted = true;
        handlers.onError(typeof ev.message === 'string' ? ev.message : '生成失败');
      }
    } catch {
      /* ignore */
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      carry += decoder.decode(value, { stream: true });
      carry = carry.replace(/\r\n/g, '\n');
      const lines = carry.split('\n');
      carry = lines.pop() ?? '';
      for (const line of lines) {
        processLine(line);
      }
    }
    if (carry.trim()) {
      for (const line of carry.split('\n')) {
        processLine(line);
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!aborted && !sawDone) {
    handlers.onError('流式响应未正常结束');
  }
}

function buildPlanAssistantStreamUrl(baseURL: string): string {
  const path = `/plans/assistant-stream`;
  const b = baseURL.replace(/\/$/, '').trim();
  if (!b) return path;
  return `${b}${path}`;
}

export async function consumePlanAssistantStream(
  baseURL: string,
  token: string,
  body: PlanAssistantStreamBody,
  handlers: {
    onDelta: (t: string) => void;
    onBodyComplete?: () => void;
    onMetaReady?: (payload: { suggestedContent?: string; schedule?: unknown; meta?: unknown }) => void;
    onDone: () => void;
    onError: (msg: string) => void;
  },
): Promise<void> {
  const url = buildPlanAssistantStreamUrl(baseURL);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { message?: string };
      if (j.message) msg = j.message;
    } catch {
      /* keep msg */
    }
    handlers.onError(msg);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    handlers.onError('无法读取流式响应');
    return;
  }

  const decoder = new TextDecoder();
  let carry = '';
  let sawDone = false;
  let aborted = false;

  const processLine = (line: string) => {
    if (aborted) return;
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const jsonStr = trimmed.replace(/^data:\s*/i, '').trim();
    if (!jsonStr || jsonStr === '[DONE]') return;
    try {
      const ev = JSON.parse(jsonStr) as {
        type?: string;
        text?: string;
        message?: string;
        ok?: boolean;
        meta?: unknown;
        suggestedContent?: string;
        schedule?: unknown;
      };
      if ((ev.type === 'delta_text' || ev.type === 'delta') && typeof ev.text === 'string') {
        handlers.onDelta(ev.text);
      } else if (ev.type === 'body_complete') {
        handlers.onBodyComplete?.();
      } else if (ev.type === 'meta_ready') {
        handlers.onMetaReady?.({ meta: ev.meta, suggestedContent: ev.suggestedContent, schedule: ev.schedule });
      } else if (ev.type === 'done' && ev.ok === true) {
        sawDone = true;
        handlers.onDone();
      } else if (ev.type === 'error') {
        aborted = true;
        handlers.onError(typeof ev.message === 'string' ? ev.message : '生成失败');
      }
    } catch {
      /* ignore */
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      carry += decoder.decode(value, { stream: true });
      carry = carry.replace(/\r\n/g, '\n');
      const lines = carry.split('\n');
      carry = lines.pop() ?? '';
      for (const line of lines) processLine(line);
    }
    if (carry.trim()) {
      for (const line of carry.split('\n')) processLine(line);
    }
  } finally {
    reader.releaseLock();
  }

  if (!aborted && !sawDone) {
    handlers.onError('流式响应未正常结束');
  }
}

export async function consumeAssistantDraftStream(
  baseURL: string,
  planId: string,
  token: string,
  payload: PendingDraftStreamPayload,
  handlers: {
    onDelta: (t: string) => void;
    onBodyComplete?: () => void;
    onDone: () => void;
    onError: (msg: string) => void;
  },
): Promise<void> {
  const url = buildAssistantStreamUrl(baseURL, planId);
  const { createTier: _ct, ...apiBody } = payload;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(apiBody),
  });
  if (!res.ok) {
    storeDraftStreamPayload(planId, payload);
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { message?: string };
      if (j.message) msg = j.message;
    } catch {
      /* keep msg */
    }
    handlers.onError(msg);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    storeDraftStreamPayload(planId, payload);
    handlers.onError('无法读取流式响应');
    return;
  }

  const decoder = new TextDecoder();
  let carry = '';
  let sawDone = false;
  let aborted = false;

  const processLine = (line: string) => {
    if (aborted) return;
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const jsonStr = trimmed.replace(/^data:\s*/i, '').trim();
    if (!jsonStr || jsonStr === '[DONE]') return;
    try {
      const ev = JSON.parse(jsonStr) as { type?: string; text?: string; message?: string; ok?: boolean };
      /** 新协议：delta_text 仅正文；兼容旧 delta（整段含 JSON） */
      if (
        (ev.type === 'delta_text' || ev.type === 'delta') &&
        typeof ev.text === 'string'
      ) {
        handlers.onDelta(ev.text);
      } else if (ev.type === 'body_complete') {
        handlers.onBodyComplete?.();
      } else if (ev.type === 'done' && ev.ok === true) {
        sawDone = true;
        handlers.onDone();
      } else if (ev.type === 'error') {
        aborted = true;
        handlers.onError(typeof ev.message === 'string' ? ev.message : '生成失败');
      }
    } catch {
      /* 忽略无法解析的行 */
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      carry += decoder.decode(value, { stream: true });
      carry = carry.replace(/\r\n/g, '\n');
      const lines = carry.split('\n');
      carry = lines.pop() ?? '';
      for (const line of lines) {
        processLine(line);
      }
    }
    if (carry.trim()) {
      for (const line of carry.split('\n')) {
        processLine(line);
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!aborted && !sawDone) {
    handlers.onError('流式响应未正常结束');
  }
}
