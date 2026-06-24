import { ref, type ComputedRef, type Ref } from "vue";
import type { PlanRecord } from "../../../../lib/api-client";
import { getApiClient } from "../../../../lib/api-client";
import { authState } from "../../../../stores/auth";

const SLOT_CONTENT_MAX_LEN = 2000;

type ExecutionSnapshot = {
  version: number;
  schedule?: unknown;
} | null;

export function useScheduleEdit(options: {
  planId: ComputedRef<string>;
  plan: Ref<PlanRecord | null>;
  executionSnapshot: ComputedRef<ExecutionSnapshot>;
  showError: (message: string) => void;
  okBanner: Ref<string>;
  slotSubmissions: (slotKey: string) => unknown[];
  isTravelPlan: ComputedRef<boolean>;
  appealWithdrawKey: Ref<string | null>;
  slotCheckinStateLabel: (slotKey: string) => string;
}) {
  const {
    planId,
    plan,
    executionSnapshot,
    showError,
    okBanner,
    slotSubmissions,
    isTravelPlan,
    appealWithdrawKey,
    slotCheckinStateLabel,
  } = options;

  const scheduleEditOpen = ref(false);
  const scheduleEditSlotKey = ref("");
  const scheduleEditContent = ref("");
  const scheduleSaving = ref(false);

  function openScheduleEdit(slotKey: string, content: string) {
    scheduleEditSlotKey.value = slotKey;
    scheduleEditContent.value = content;
    scheduleEditOpen.value = true;
  }

  function slotHasPassedSubmission(slotKey: string): boolean {
    return slotSubmissions(slotKey).length > 0;
  }

  function slotMoreActions(slotKey: string) {
    const actions: Array<
      | { key: "edit"; label: string; testid: string; disabled?: boolean }
      | {
          key: "restore";
          label: string;
          testid: string;
          danger?: boolean;
          disabled?: boolean;
        }
      | {
          key: "withdrawAppeal";
          label: string;
          testid: string;
          disabled?: boolean;
        }
    > = [];
    if (!slotHasPassedSubmission(slotKey)) {
      actions.push({
        key: "edit",
        label: "编辑",
        testid: "schedule-slot-edit",
        disabled: scheduleSaving.value,
      });
      actions.push({
        key: "restore",
        label: "恢复",
        testid: "schedule-slot-restore",
        danger: true,
        disabled: scheduleSaving.value,
      });
    }
    if (!isTravelPlan.value && slotCheckinStateLabel(slotKey) === "申诉中") {
      actions.push({
        key: "withdrawAppeal",
        label: appealWithdrawKey.value === slotKey ? "撤销中…" : "撤销申诉",
        testid: "schedule-slot-appeal-withdraw",
        disabled: !!appealWithdrawKey.value,
      });
    }
    return actions;
  }

  async function saveScheduleEdit() {
    if (!authState.token) return;
    const slotKey = scheduleEditSlotKey.value;
    if (!slotKey) return;

    const next = (scheduleEditContent.value ?? "").trim();
    if (!next) {
      showError("这里还没写内容。补充一下再保存吧。");
      return;
    }
    if (next.length > SLOT_CONTENT_MAX_LEN) {
      showError(
        `内容有点长了（最多 ${SLOT_CONTENT_MAX_LEN} 字），可以适当精简一下`,
      );
      return;
    }

    try {
      const baseText =
        `${plan.value?.goal ?? ""} ${plan.value?.requirement ?? ""}`.slice(
          0,
          4000,
        );
      const tokenize = (s: string) =>
        s
          .toLowerCase()
          .match(/[a-z0-9\u4e00-\u9fa5]{2,}/gi)
          ?.slice(0, 160) ?? [];
      const a = new Set(tokenize(next));
      const b = new Set(tokenize(baseText));
      if (a.size > 0 && next.length > 40) {
        let inter = 0;
        for (const t of a) if (b.has(t)) inter += 1;
        const score = inter / a.size;
        if (score < 0.05) {
          okBanner.value =
            "提醒：这段内容看起来和你的目标不太一致。需要我帮你一起调整吗？你也可以继续保存。";
          window.setTimeout(() => {
            okBanner.value = "";
          }, 4000);
        }
      }
    } catch {
      /* ignore soft validation errors */
    }

    const draftPlanVersion =
      plan.value?.status === "draft" && executionSnapshot.value
        ? executionSnapshot.value.version
        : undefined;
    scheduleSaving.value = true;
    try {
      const res = await getApiClient().patchPlanScheduleSlot({
        id: planId.value,
        slotKey,
        token: authState.token,
        content: next,
        version: draftPlanVersion,
      });
      if (plan.value?.draft?.versions?.length && executionSnapshot.value) {
        const targetVersion = executionSnapshot.value.version;
        const idx = plan.value.draft.versions.findIndex(
          (v) => v.version === targetVersion,
        );
        if (idx >= 0)
          plan.value.draft.versions[idx] = {
            ...plan.value.draft.versions[idx],
            schedule: res.schedule,
          };
      }
      scheduleEditOpen.value = false;
    } catch (e) {
      showError(e instanceof Error ? e.message : "没保存成功，请稍后再试");
    } finally {
      scheduleSaving.value = false;
    }
  }

  async function restoreScheduleSlot(slotKey: string) {
    if (!authState.token) return;
    const draftPlanVersion =
      plan.value?.status === "draft" && executionSnapshot.value
        ? executionSnapshot.value.version
        : undefined;
    scheduleSaving.value = true;
    try {
      const res = await getApiClient().patchPlanScheduleSlot({
        id: planId.value,
        slotKey,
        token: authState.token,
        restore: true,
        version: draftPlanVersion,
      });
      if (plan.value?.draft?.versions?.length && executionSnapshot.value) {
        const targetVersion = executionSnapshot.value.version;
        const idx = plan.value.draft.versions.findIndex(
          (v) => v.version === targetVersion,
        );
        if (idx >= 0)
          plan.value.draft.versions[idx] = {
            ...plan.value.draft.versions[idx],
            schedule: res.schedule,
          };
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : "没恢复成功，请稍后再试");
    } finally {
      scheduleSaving.value = false;
    }
  }

  return {
    scheduleEditOpen,
    scheduleEditSlotKey,
    scheduleEditContent,
    scheduleSaving,
    openScheduleEdit,
    saveScheduleEdit,
    restoreScheduleSlot,
    slotHasPassedSubmission,
    slotMoreActions,
    SLOT_CONTENT_MAX_LEN,
  };
}
