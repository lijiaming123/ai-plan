import crypto from 'node:crypto';

type WindowCounter = { windowStart: number; count: number };

export type RateLimitHit = {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
  reasonCode?: 'too_many_requests';
};

const rateMap = new Map<string, WindowCounter>();

function hashKey(raw: string) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function hitSimpleRateLimit(params: {
  keyParts: Array<string | null | undefined>;
  windowMs: number;
  max: number;
}): RateLimitHit {
  const now = Date.now();
  const key = hashKey(params.keyParts.filter(Boolean).join('|'));
  const cur = rateMap.get(key);

  if (!cur || now - cur.windowStart >= params.windowMs) {
    rateMap.set(key, { windowStart: now, count: 1 });
    return {
      allowed: true,
      remaining: Math.max(0, params.max - 1),
      resetInMs: params.windowMs,
    };
  }

  cur.count += 1;
  const resetInMs = Math.max(0, params.windowMs - (now - cur.windowStart));
  if (cur.count > params.max) {
    return { allowed: false, remaining: 0, resetInMs, reasonCode: 'too_many_requests' };
  }
  return { allowed: true, remaining: Math.max(0, params.max - cur.count), resetInMs };
}

