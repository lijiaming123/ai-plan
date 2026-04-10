const DEFAULT_CHAT_URL = 'https://api.deepseek.com/v1/chat/completions';

export type DeepseekChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export function isDeepseekConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY?.trim());
}

/**
 * OpenAI-compatible chat completion (DeepSeek).
 * @throws if key missing, HTTP error, or empty model output
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
