import { prisma } from "../../lib/prisma";
import { addCalendarDaysEndUtc } from "./natural-month";
import { getAuthBillingPayload } from "./auth-billing";

const TRIAL_DAYS = 7;

export async function startProTrial(
  userId: string,
): Promise<
  | ({ ok: true } & Awaited<ReturnType<typeof getAuthBillingPayload>>)
  | { ok: false; code: 404 | 409; message: string }
> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, proTrialUsedAt: true },
  });
  if (!row) {
    return { ok: false, code: 404, message: "User not found" };
  }
  if (row.proTrialUsedAt != null) {
    return { ok: false, code: 409, message: "trial_already_used" };
  }

  const now = new Date();
  const proExpiresAt = addCalendarDaysEndUtc(now, TRIAL_DAYS);

  await prisma.user.update({
    where: { id: userId },
    data: {
      planTier: "pro",
      proExpiresAt,
      proTrialUsedAt: now,
      proSubscriptionSource: "trial",
    },
  });

  const billing = await getAuthBillingPayload(userId);
  return { ok: true, ...billing };
}
