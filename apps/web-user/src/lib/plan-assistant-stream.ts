export type PendingDraftStreamPayload = {
  assistantPrompt: string;
  startDate: string;
  cycle: string;
  endDate: string;
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

function buildAssistantStreamUrl(baseURL: string, planId: string): string {
  const path = `/plans/${encodeURIComponent(planId)}/assistant-draft-stream`;
  const b = baseURL.replace(/\/$/, '').trim();
  if (!b) return path;
  return `${b}${path}`;
}

export async function consumeAssistantDraftStream(
  baseURL: string,
  planId: string,
  token: string,
  payload: PendingDraftStreamPayload,
  handlers: {
    onDelta: (t: string) => void;
    onDone: () => void;
    onError: (msg: string) => void;
  },
): Promise<void> {
  const url = buildAssistantStreamUrl(baseURL, planId);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
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
      if (ev.type === 'delta' && typeof ev.text === 'string') {
        handlers.onDelta(ev.text);
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
