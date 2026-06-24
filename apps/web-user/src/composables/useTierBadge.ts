import { computed } from "vue";
import { authState } from "../stores/auth";
import { formatExpiresDate, daysUntilExpires } from "../lib/plan-dates";

/** 会员档位展示文案（Shell / Settings 共用） */
export function useTierBadge() {
  const tierBadgeLabel = computed(() => {
    if (authState.tier === "pro") {
      return authState.subscriptionSource === "trial" ? "专业版（试用）" : "专业版";
    }
    return "基础版";
  });

  const membershipKind = computed(() => {
    if (authState.tier === "pro") return "active" as const;
    if (authState.proTrialUsed) return "expired" as const;
    return "trial_eligible" as const;
  });

  const expiresDateText = computed(() =>
    authState.proExpiresAt ? formatExpiresDate(authState.proExpiresAt) : "",
  );

  const expiresDaysLeft = computed(() =>
    authState.proExpiresAt ? daysUntilExpires(authState.proExpiresAt) : 0,
  );

  const priceYuan = computed(() => {
    const cents = authState.priceCents > 0 ? authState.priceCents : 1900;
    return (cents / 100).toFixed(0);
  });

  return {
    tierBadgeLabel,
    membershipKind,
    expiresDateText,
    expiresDaysLeft,
    priceYuan,
  };
}
