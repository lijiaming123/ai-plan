import { prisma } from "../../lib/prisma";
import {
  getAiQuotaStatus,
  resolveEffectivePlanTier,
} from "./ai-quota.service";

export type SubscriptionSource = "none" | "trial" | "paid";

export type AuthBillingPayload = {
  planTier: "basic" | "pro";
  proExpiresAt: string | null;
  proTrialUsed: boolean;
  subscriptionSource: SubscriptionSource;
  billingCycle: "monthly";
  priceCents: number;
  aiQuota: {
    used: number;
    limit: number;
    yearMonth: string;
  } | null;
};

export async function getAuthBillingPayload(
  userId: string,
): Promise<AuthBillingPayload> {
  const planTier = await resolveEffectivePlanTier(userId);
  const aiQuota = await getAiQuotaStatus(userId);
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      proExpiresAt: true,
      proTrialUsedAt: true,
      proSubscriptionSource: true,
    },
  });

  const proExpiresAt = row?.proExpiresAt?.toISOString() ?? null;
  const proTrialUsed = row?.proTrialUsedAt != null;

  let subscriptionSource: SubscriptionSource = "none";
  if (planTier === "pro") {
    const src = row?.proSubscriptionSource?.trim();
    if (src === "paid") subscriptionSource = "paid";
    else if (src === "trial") subscriptionSource = "trial";
  }

  return {
    planTier,
    proExpiresAt,
    proTrialUsed,
    subscriptionSource,
    billingCycle: "monthly",
    priceCents: 1900,
    aiQuota: aiQuota
      ? {
          used: aiQuota.used,
          limit: aiQuota.limit,
          yearMonth: aiQuota.yearMonth,
        }
      : null,
  };
}
