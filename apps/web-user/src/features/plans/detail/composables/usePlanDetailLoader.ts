import { computed, ref, type ComputedRef } from "vue";
import type { PlanRecord } from "../../../../lib/api-client";
import { getApiClient } from "../../../../lib/api-client";
import { authState } from "../../../../stores/auth";
import { formatDetailDeadline } from "../../../../lib/plan-dates";
import { planStatusLabel, planTypeLabel } from "../../../../lib/plan-labels";

export function usePlanDetailLoader(
  planId: ComputedRef<string>,
  showError: (message: string) => void,
) {
  const loading = ref(false);
  const plan = ref<PlanRecord | null>(null);

  const isDraft = computed(() => plan.value?.status === "draft");
  const isArchived = computed(() => plan.value?.status === "archived");
  const isTravelPlan = computed(
    () => (plan.value?.type ?? "").toLowerCase() === "travel",
  );
  const isGeneralPlan = computed(
    () => (plan.value?.type ?? "").toLowerCase() === "general",
  );

  const executionSnapshot = computed(() => {
    const d = plan.value?.draft;
    if (!d?.versions?.length) return null;
    const confirmed = d.confirmedVersion;
    if (confirmed != null) {
      return d.versions.find((v) => v.version === confirmed) ?? d.versions[0];
    }
    return d.versions[d.versions.length - 1];
  });

  const checkinSchedule = computed(
    () => executionSnapshot.value?.schedule ?? null,
  );

  function slotSubmissions(slotKey: string) {
    return plan.value?.scheduleSlotSubmissions?.[slotKey] ?? [];
  }

  const planFullySubmitted = computed(() => {
    if (isDraft.value || !checkinSchedule.value) return false;
    const slots = checkinSchedule.value.slots ?? [];
    if (slots.length === 0) return false;
    return slots.every((s) => slotSubmissions(s.slotKey).length > 0);
  });

  const isCompletedPlan = computed(
    () => !isArchived.value && !isDraft.value && planFullySubmitted.value,
  );

  const isPastPlanDeadline = computed(() => {
    if (!plan.value?.deadline) return false;
    const t = new Date(plan.value.deadline).getTime();
    if (Number.isNaN(t)) return false;
    return Date.now() > t;
  });

  const canSubmitCheckin = computed(
    () =>
      !!authState.token &&
      !isDraft.value &&
      !isArchived.value &&
      plan.value?.status === "active",
  );

  const breadcrumbTail = computed(() => {
    if (loading.value && !plan.value) return "加载中…";
    const g = plan.value?.goal?.trim();
    if (g) return g.length > 30 ? `${g.slice(0, 30)}…` : g;
    return `计划 ${planId.value}`;
  });

  const breadcrumbTailTitle = computed(() => plan.value?.goal?.trim() ?? "");

  const statusLabel = computed(() =>
    planStatusLabel({
      status: plan.value?.status,
      isArchived: isArchived.value,
      isCompleted: isCompletedPlan.value,
    }),
  );

  const typeLabel = computed(() => planTypeLabel(plan.value?.type));

  async function loadPlanDetail() {
    loading.value = true;
    try {
      plan.value = await getApiClient().getPlan({
        id: planId.value,
        token: authState.token,
      });
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "没能加载计划详情，请稍后再试",
      );
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    plan,
    isDraft,
    isArchived,
    isTravelPlan,
    isGeneralPlan,
    executionSnapshot,
    checkinSchedule,
    slotSubmissions,
    planFullySubmitted,
    isCompletedPlan,
    isPastPlanDeadline,
    canSubmitCheckin,
    breadcrumbTail,
    breadcrumbTailTitle,
    statusLabel,
    typeLabel,
    loadPlanDetail,
  };
}

export { formatDetailDeadline };
