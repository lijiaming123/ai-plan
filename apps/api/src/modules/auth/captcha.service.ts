import crypto from "node:crypto";

const CHARSET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 5000;

type CaptchaEntry = { answer: string; exp: number };

const store = new Map<string, CaptchaEntry>();

function pruneExpired() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.exp <= now) store.delete(k);
  }
}

function randomChar() {
  return CHARSET[crypto.randomInt(0, CHARSET.length)]!;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSvg(chars: string[]): string {
  const w = 132;
  const h = 44;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
  );
  parts.push(`<rect width="100%" height="100%" fill="#f6f8f6"/>`);
  for (let i = 0; i < 5; i++) {
    const x1 = crypto.randomInt(0, w);
    const y1 = crypto.randomInt(0, h);
    const x2 = crypto.randomInt(0, w);
    const y2 = crypto.randomInt(0, h);
    parts.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#c5d4cc" stroke-width="1.2"/>`,
    );
  }
  const step = w / (chars.length + 1);
  chars.forEach((ch, i) => {
    const x = step * (i + 1) + crypto.randomInt(-6, 7);
    const y = h / 2 + crypto.randomInt(4, 10);
    const rot = crypto.randomInt(-22, 23);
    const fill = ["#1a4d3a", "#2d6a4f", "#52796f", "#354f52"][crypto.randomInt(0, 4)]!;
    parts.push(
      `<text x="${x}" y="${y}" fill="${fill}" font-size="22" font-family="system-ui,Segoe UI,sans-serif" font-weight="700" text-anchor="middle" transform="rotate(${rot} ${x} ${y})">${escapeXml(
        ch,
      )}</text>`,
    );
  });
  for (let i = 0; i < 30; i++) {
    const cx = crypto.randomInt(0, w);
    const cy = crypto.randomInt(0, h);
    parts.push(`<circle cx="${cx}" cy="${cy}" r="0.9" fill="#a8bdb3"/>`);
  }
  parts.push("</svg>");
  return parts.join("");
}

export function createCaptchaSession(): { captchaId: string; imageSvg: string } {
  pruneExpired();
  if (store.size > MAX_ENTRIES) {
    store.clear();
  }

  const chars = Array.from({ length: 4 }, () => randomChar());
  const answer = chars.join("").toLowerCase();
  const captchaId = crypto.randomUUID();
  store.set(captchaId, { answer, exp: Date.now() + TTL_MS });

  return { captchaId, imageSvg: buildSvg(chars) };
}

/**
 * 校验并一次性消费：成功返回 true，失败或过期返回 false。
 */
export function verifyCaptchaAnswer(captchaId: string, userInput: string): boolean {
  pruneExpired();
  const id = captchaId.trim();
  const raw = userInput.trim();
  if (!id || !raw) return false;

  const row = store.get(id);
  store.delete(id);
  if (!row || row.exp <= Date.now()) return false;

  return row.answer === raw.toLowerCase();
}

/** 仅 Vitest / NODE_ENV=test 下调试用，生产不可用 */
export function peekCaptchaAnswerForTest(id: string): string | undefined {
  if (process.env.NODE_ENV !== "test") return undefined;
  return store.get(id)?.answer;
}
