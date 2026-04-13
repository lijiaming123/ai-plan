/**
 * DeepSeek（OpenAI Chat Completions 兼容协议）HTTP 客户端。
 *
 * 环境变量：
 * - DEEPSEEK_API_KEY（必填）：无则 isDeepseekConfigured() 为 false，业务层应走本地模板。
 * - DEEPSEEK_API_URL（可选）：默认官方 `.../v1/chat/completions`；自建兼容网关时可改。
 * - DEEPSEEK_MODEL（可选）：默认 `deepseek-chat`。
 * - DEEPSEEK_TIMEOUT_MS（可选）：非流式请求超时，默认 120000ms；到点 AbortController 中止 fetch。
 *
 * 两套 API：
 * - completeDeepseekChat：一次性 JSON 响应，解析 `choices[0].message.content`。
 * - streamDeepseekChat：SSE，`data: {json}` 行内 `choices[0].delta.content` 逐段 yield；遇 `data: [DONE]` 结束。
 */
const DEFAULT_CHAT_URL = 'https://api.deepseek.com/v1/chat/completions';

/** 与 OpenAI messages 数组格式一致，多轮对话按顺序传入 */
export type DeepseekChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

/** 路由层可用此判断「是否启用云端 AI」，未配置时不得调用 complete/stream（会抛错） */
export function isDeepseekConfigured(): boolean {
  // 测试环境禁止真实网络调用（保证 Vitest 稳定、可重复）
  if (process.env.NODE_ENV === 'test') return false;
  return Boolean(process.env.DEEPSEEK_API_KEY?.trim());
}

/**
 * 非流式补全：整段返回模型生成的 assistant 文本。
 *
 * @throws Error 未配置 KEY、HTTP 非 2xx、响应非 JSON、或正文为空
 * @param messages 通常含一条 system（人设）+ 一条或多条 user/assistant
 */
export async function completeDeepseekChat(messages: DeepseekChatMessage[]): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not set');
  }

  const url = process.env.DEEPSEEK_API_URL?.trim() || DEFAULT_CHAT_URL;
  const model = process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat';

  const controller = new AbortController();
  const timeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS ?? '120000');
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 120000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.6,
      }),
    });

    const raw = await res.text();
    if (!res.ok) {
      throw new Error(`DeepSeek HTTP ${res.status}: ${raw.slice(0, 400)}`);
    }

    let data: unknown;
    try {
      data = JSON.parse(raw) as unknown;
    } catch {
      throw new Error('DeepSeek response is not valid JSON');
    }

    const content = extractChatContent(data);
    if (!content) {
      throw new Error('DeepSeek returned empty content');
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 流式补全：异步迭代器每次 yield 一小段 UTF-8 文本（可能按 token 切分）。
 * 按行缓冲解析 SSE，避免半个 JSON 被误解析；`options.signal` 用于客户端断开时中止上游请求。
 */
export async function* streamDeepseekChat(
  messages: DeepseekChatMessage[],
  options?: { signal?: AbortSignal },
): AsyncGenerator<string, void, undefined> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not set');
  }

  const url = process.env.DEEPSEEK_API_URL?.trim() || DEFAULT_CHAT_URL;
  const model = process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat';

  const res = await fetch(url, {
    method: 'POST',
    signal: options?.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.6,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => '');
    throw new Error(`DeepSeek stream HTTP ${res.status}: ${t.slice(0, 400)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      carry += decoder.decode(value, { stream: true });
      const parts = carry.split('\n');
      carry = parts.pop() ?? '';
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.replace(/^data:\s*/, '');
        try {
          const parsed = JSON.parse(jsonStr) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const piece = parsed.choices?.[0]?.delta?.content;
          if (typeof piece === 'string' && piece.length > 0) {
            yield piece;
          }
        } catch {
          /* 非 JSON 行忽略 */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * 从非流式响应体解析 assistant 正文（兼容 OpenAI 形状）。
 * 流式路径不使用此函数（流式用 delta.content）。
 */
function extractChatContent(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length < 1) return null;
  const first = choices[0];
  if (!first || typeof first !== 'object') return null;
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== 'object') return null;
  const content = (message as { content?: unknown }).content;
  if (typeof content !== 'string') return null;
  const trimmed = content.trim();
  return trimmed.length > 0 ? trimmed : null;
}
