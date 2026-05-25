import { prisma } from "../../lib/prisma";

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
