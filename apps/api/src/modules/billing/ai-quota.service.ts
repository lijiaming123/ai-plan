/**
 * 计划域 AI 调用月度配额（UTC 自然月）。仅对 User 表中存在的账号生效；演示 JWT（如 user_demo）无对应行则不扣次。
 */
import { prisma } from "../../lib/prisma";

export type PlanTier = "basic" | "pro";

const DEFAULT_BASIC_LIMIT = 30;
const DEFAULT_PRO_LIMIT = 500;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim() ?? "";
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function monthlyAiLimitForTier(tier: PlanTier): number {
  if (tier === "pro") {
    return envInt("AI_QUOTA_PRO_MONTHLY", DEFAULT_PRO_LIMIT);
  }
  return envInt("AI_QUOTA_BASIC_MONTHLY", DEFAULT_BASIC_LIMIT);
}

/** 当前 UTC 年月，格式 YYYY-MM */
export function utcYearMonthKey(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function proUserIdSet(): Set<string> {
  return new Set(
    (process.env.PRO_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * 有效档位：库表 planTier=pro 且未过期，或仍在 PRO_USER_IDS 白名单（迁移期兼容）。
 */
export async function resolveEffectivePlanTier(userId: string): Promise<PlanTier> {
  if (proUserIdSet().has(userId)) return "pro";
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { planTier: true, proExpiresAt: true },
  });
  if (row?.planTier === "pro") {
    if (
      row.proExpiresAt != null &&
      row.proExpiresAt.getTime() <= Date.now()
    ) {
      return "basic";
    }
    return "pro";
  }
  return "basic";
}

/**
 * Pro 计划助手（多步 Agent）是否对该用户开放：`PRO_PLAN_AGENT_ENABLED=1` 全员试用；否则需有效 pro 档位（含白名单，见 resolveEffectivePlanTier）。
 */
export async function userMayUsePlanProAgentFeatures(
  userId: string,
): Promise<boolean> {
  if ((process.env.PRO_PLAN_AGENT_ENABLED ?? "").trim() === "1") {
    return true;
  }
  return (await resolveEffectivePlanTier(userId)) === "pro";
}

export type AiQuotaStatus = {
  used: number;
  limit: number;
  yearMonth: string;
  tier: PlanTier;
};

export async function getAiQuotaStatus(userId: string): Promise<AiQuotaStatus | null> {
  const exists = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!exists) return null;

  const tier = await resolveEffectivePlanTier(userId);
  const limit = monthlyAiLimitForTier(tier);
  const yearMonth = utcYearMonthKey();
  const row = await prisma.userMonthlyAiUsage.findUnique({
    where: {
      userId_yearMonth: { userId, yearMonth },
    },
    select: { count: true },
  });
  return {
    used: row?.count ?? 0,
    limit,
    yearMonth,
    tier,
  };
}

export type ReserveAiQuotaResult =
  | { ok: true; used: number; limit: number; yearMonth: string; tier: PlanTier }
  | {
      ok: false;
      used: number;
      limit: number;
      yearMonth: string;
      tier: PlanTier;
      message: string;
    };

/**
 * 在调用外部 LLM 前预留 1 次额度（成功则 count+1）。非 User 表账号直接放行（ok: true, skipped 用 ok true 且 used 不变 — 用 optional）
 */
export async function reserveOnePlanAiQuotaUnit(
  userId: string,
): Promise<ReserveAiQuotaResult & { enforced?: boolean }> {
  const exists = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!exists) {
    const tier = await resolveEffectivePlanTier(userId);
    return {
      ok: true,
      used: 0,
      limit: monthlyAiLimitForTier(tier),
      yearMonth: utcYearMonthKey(),
      tier,
      enforced: false,
    };
  }

  const tier = await resolveEffectivePlanTier(userId);
  const limit = monthlyAiLimitForTier(tier);
  const yearMonth = utcYearMonthKey();

  try {
    const out = await prisma.$transaction(async (tx) => {
      const current = await tx.userMonthlyAiUsage.findUnique({
        where: { userId_yearMonth: { userId, yearMonth } },
        select: { count: true },
      });
      const prev = current?.count ?? 0;
      if (prev >= limit) {
        return {
          ok: false as const,
          used: prev,
          limit,
          yearMonth,
          tier,
          message: `本月智能生成次数已用完（${limit} 次），下月自动重置或升级专业版。`,
        };
      }
      const next = prev + 1;
      await tx.userMonthlyAiUsage.upsert({
        where: { userId_yearMonth: { userId, yearMonth } },
        create: { userId, yearMonth, count: next },
        update: { count: next },
      });
      return {
        ok: true as const,
        used: next,
        limit,
        yearMonth,
        tier,
      };
    });
    return { ...out, enforced: true };
  } catch {
    return {
      ok: false,
      used: 0,
      limit,
      yearMonth,
      tier,
      message: "配额校验失败，请稍后重试。",
    };
  }
}
