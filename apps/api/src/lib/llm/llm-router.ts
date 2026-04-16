import type { LlmCompleteResult, LlmMessage, LlmProvider, LlmTask } from "./llm-types";

type CacheEntry = { expiresAt: number; value: LlmCompleteResult };

export function createLlmRouter(params: {
  providers: LlmProvider[];
  now?: () => number;
  defaultTtlMs?: number;
  onMetric?: (m: {
    task: LlmTask;
    providerId: string;
    cached: boolean;
    ms: number;
    ok: boolean;
  }) => void;
}) {
  const now = params.now ?? (() => Date.now());
  const ttl = params.defaultTtlMs ?? 60_000;
  const cache = new Map<string, CacheEntry>();

  async function complete(input: {
    task: LlmTask;
    messages: LlmMessage[];
    cacheKey: string;
    timeoutMs?: number;
  }): Promise<LlmCompleteResult> {
    const t0 = now();
    const hit = cache.get(input.cacheKey);
    if (hit && hit.expiresAt > t0) {
      params.onMetric?.({
        task: input.task,
        providerId: hit.value.providerId,
        cached: true,
        ms: 0,
        ok: true,
      });
      return { ...hit.value, cached: true };
    }

    let lastErr: unknown = null;
    for (const p of params.providers) {
      const start = now();
      try {
        const text = await p.complete({
          task: input.task,
          messages: input.messages,
          timeoutMs: input.timeoutMs,
        });
        const end = now();
        const value: LlmCompleteResult = {
          text,
          providerId: p.id,
          cached: false,
          ms: Math.max(0, end - start),
        };
        cache.set(input.cacheKey, { expiresAt: end + ttl, value });
        params.onMetric?.({
          task: input.task,
          providerId: p.id,
          cached: false,
          ms: value.ms,
          ok: true,
        });
        return value;
      } catch (e) {
        const end = now();
        params.onMetric?.({
          task: input.task,
          providerId: p.id,
          cached: false,
          ms: Math.max(0, end - start),
          ok: false,
        });
        lastErr = e;
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error("LLM router: all providers failed");
  }

  return { complete };
}

