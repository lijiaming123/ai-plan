import { prisma } from "../../lib/prisma";
import { extendProExpiresByOneMonth } from "../billing/natural-month";

export async function patchAppUserPlanTier(input: {
  userId: string;
  planTier: "basic" | "pro";
  proExpiresAt: Date | null;
}): Promise<
  { ok: true } | { ok: false; code: 404; message: string }
> {
  const u = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true },
  });
  if (!u) {
    return { ok: false, code: 404, message: "App user not found" };
  }
  await prisma.user.update({
    where: { id: input.userId },
    data: {
      planTier: input.planTier,
      proExpiresAt: input.proExpiresAt,
      proSubscriptionSource:
        input.planTier === "pro" ? "paid" : null,
    },
  });
  return { ok: true };
}

/** 运营一键续期：Pro +1 自然月；未过期则在原到期日上叠加，否则从今日起算。 */
export async function renewAppUserProMonth(userId: string): Promise<
  | { ok: true; planTier: "pro"; proExpiresAt: Date; proSubscriptionSource: "paid" }
  | { ok: false; code: 404; message: string }
> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, proExpiresAt: true },
  });
  if (!u) {
    return { ok: false, code: 404, message: "App user not found" };
  }
  const now = new Date();
  const proExpiresAt = extendProExpiresByOneMonth(u.proExpiresAt, now);
  await prisma.user.update({
    where: { id: userId },
    data: {
      planTier: "pro",
      proExpiresAt,
      proSubscriptionSource: "paid",
    },
  });
  return {
    ok: true,
    planTier: "pro",
    proExpiresAt,
    proSubscriptionSource: "paid",
  };
}
