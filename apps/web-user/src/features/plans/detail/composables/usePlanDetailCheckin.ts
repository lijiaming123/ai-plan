import { ref, watch, type ComputedRef, type Ref } from "vue";
import type { CheckinPublicReview, PlanRecord } from "../../../../lib/api-client";
import { getApiClient, HttpApiError } from "../../../../lib/api-client";
import { trackEvent } from "../../../../lib/telemetry";
import { authState } from "../../../../stores/auth";
import {
  CHECKIN_MAX_FILES,
  CHECKIN_MAX_FILE_SIZE_BYTES,
  isAllowedCheckinFile,
  mergeCheckinAttachments,
} from "../../../../lib/checkin-attachments";

type SlotCheckinState = "未提交" | "已提交" | "申诉中" | "未完成" | "已完成";

export function usePlanDetailCheckin(options: {
  planId: ComputedRef<string>;
  plan: Ref<PlanRecord | null>;
  isTravelPlan: ComputedRef<boolean>;
  isGeneralPlan: ComputedRef<boolean>;
  slotSubmissions: (slotKey: string) => Array<{ content?: string | null }>;
  showError: (message: string) => void;
  okBanner: Ref<string>;
  loadPlanDetail: () => Promise<void>;
}) {
  const {
    planId,
    plan,
    isTravelPlan,
    isGeneralPlan,
    slotSubmissions,
    showError,
    okBanner,
    loadPlanDetail,
  } = options;

  const checkinOpen = ref(false);
  const checkinSlotKey = ref("");
  const checkinSlotPlanText = ref("");
  const checkinContent = ref("");
  const checkinUploadedFiles = ref<Array<{ url: string; fileName: string }>>([]);
  const checkinManualLinks = ref<Array<{ url: string; fileName: string }>>([
    { url: "", fileName: "" },
  ]);
  const checkinSaving = ref(false);
  const checkinFileUploading = ref(false);
  const checkinDropActive = ref(false);
  const checkinUploadProgress = ref("");
  let checkinDraftSaveTimer: ReturnType<typeof setTimeout> | null = null;
  const checkinReview = ref<CheckinPublicReview | null>(null);
  const checkinAppealText = ref("");
  const appealSubmitting = ref(false);
  const appealWithdrawKey = ref<string | null>(null);

  const submissionDrawerOpen = ref(false);
  const submissionDrawerSlotKey = ref("");
  const submissionDrawerPlanText = ref("");

  function checkinBandLabel(
    band: CheckinPublicReview["dimensions"][number]["band"],
  ): string {
    if (band === "high") return "良好";
    if (band === "mid") return "一般";
    return "偏低";
  }

  function slotCheckinStateLabel(slotKey: string): SlotCheckinState {
    if (isTravelPlan.value) {
      return slotSubmissions(slotKey).length > 0 ? "已完成" : "未完成";
    }
    if (plan.value?.scheduleSlotOpenAppeals?.[slotKey]) return "申诉中";
    if (slotSubmissions(slotKey).length > 0) return "已提交";
    return "未提交";
  }

  function slotCheckinStatePillClass(slotKey: string): string {
    const s = slotCheckinStateLabel(slotKey);
    if (s === "申诉中") {
      return "bg-amber-50 text-amber-900 ring-1 ring-amber-200/80";
    }
    if (s === "已提交" || s === "已完成") {
      return "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/80";
    }
    return "bg-slate-100 text-slate-600 ring-1 ring-slate-200/80";
  }

  function latestSubmission(slotKey: string) {
    const list = slotSubmissions(slotKey);
    return list.length > 0 ? list[0] : null;
  }

  function latestSubmissionLabel(slotKey: string): string {
    const s = latestSubmission(slotKey);
    if (!s) return "—";
    const text = (s.content ?? "").trim().replace(/\s+/g, " ");
    const snippet = text
      ? text.length > 22
        ? `${text.slice(0, 22)}…`
        : text
      : "（无文字说明）";
    return snippet;
  }

  function slotSubmissionSummary(slotKey: string): string {
    const list = slotSubmissions(slotKey);
    if (list.length === 0) return "—";
    return `最新：${latestSubmissionLabel(slotKey)} · 共 ${list.length} 条`;
  }

  function checkinDraftStorageKey(slotKey: string): string {
    return `planCheckinDraft:${planId.value}:${slotKey}`;
  }

  function tryLoadCheckinDraft(slotKey: string) {
    try {
      const raw = localStorage.getItem(checkinDraftStorageKey(slotKey));
      if (!raw) return;
      const d = JSON.parse(raw) as {
        content?: string;
        uploaded?: Array<{ url: string; fileName: string }>;
        manual?: Array<{ url: string; fileName: string }>;
      };
      if (typeof d.content === "string") checkinContent.value = d.content;
      if (Array.isArray(d.uploaded) && d.uploaded.length > 0) {
        checkinUploadedFiles.value = d.uploaded
          .map((r) => ({
            url: String(r.url ?? ""),
            fileName: String(r.fileName ?? "附件"),
          }))
          .filter((r) => r.url.length > 0);
      }
      if (Array.isArray(d.manual) && d.manual.length > 0) {
        checkinManualLinks.value = d.manual.map((r) => ({
          url: String(r.url ?? ""),
          fileName: String(r.fileName ?? ""),
        }));
      }
    } catch {
      /* 忽略坏数据 */
    }
  }

  function clearCheckinDraftForSlot(slotKey: string) {
    try {
      localStorage.removeItem(checkinDraftStorageKey(slotKey));
    } catch {
      /* ignore */
    }
  }

  function prepareCheckinDraft(slotKey: string, planText: string) {
    checkinSlotKey.value = slotKey;
    checkinSlotPlanText.value = planText;
    checkinContent.value = "";
    checkinUploadedFiles.value = [];
    checkinManualLinks.value = [{ url: "", fileName: "" }];
    checkinReview.value = null;
    checkinAppealText.value = "";
    tryLoadCheckinDraft(slotKey);
  }

  function openCheckinSubmit(slotKey: string, planText: string) {
    prepareCheckinDraft(slotKey, planText);
    checkinOpen.value = true;
  }

  function openTravelRecordDrawer(slotKey: string, planText: string) {
    prepareCheckinDraft(slotKey, planText);
    submissionDrawerSlotKey.value = slotKey;
    submissionDrawerPlanText.value = planText;
    submissionDrawerOpen.value = true;
  }

  function openGeneralNoteDrawer(slotKey: string, planText: string) {
    prepareCheckinDraft(slotKey, planText);
    submissionDrawerSlotKey.value = slotKey;
    submissionDrawerPlanText.value = planText;
    submissionDrawerOpen.value = true;
  }

  function openSubmissionHistory(slotKey: string, planText: string) {
    if (slotSubmissions(slotKey).length === 0) return;
    submissionDrawerSlotKey.value = slotKey;
    submissionDrawerPlanText.value = planText;
    submissionDrawerOpen.value = true;
  }

  async function toggleTravelSlotCompletion(slotKey: string) {
    if (checkinSaving.value) return;
    if (!authState.token) return;
    checkinSaving.value = true;
    try {
      const done = slotSubmissions(slotKey).length > 0;
      if (done) {
        await getApiClient().deletePlanScheduleSlotCheckin({
          id: planId.value,
          slotKey,
          token: authState.token,
        });
        const cur = { ...(plan.value?.scheduleSlotSubmissions ?? {}) };
        delete cur[slotKey];
        if (plan.value) plan.value = { ...plan.value, scheduleSlotSubmissions: cur };
        okBanner.value = "已撤销完成";
      } else {
        const { submission } = await getApiClient().postPlanScheduleSlotCheckin({
          id: planId.value,
          slotKey,
          token: authState.token,
        });
        const cur = { ...(plan.value?.scheduleSlotSubmissions ?? {}) };
        cur[slotKey] = [submission, ...(cur[slotKey] ?? [])];
        if (plan.value) plan.value = { ...plan.value, scheduleSlotSubmissions: cur };
        okBanner.value = "已标记完成";
      }
      const pt = (plan.value?.type ?? "").toLowerCase();
      if (pt === "travel" || pt === "general") {
        trackEvent("checkin_submit", {
          properties: {
            planId: planId.value,
            slotKey,
            variant: done ? "undo_checkbox" : "complete_checkbox",
          },
        });
      }
      window.setTimeout(() => {
        okBanner.value = "";
      }, 3000);
    } catch {
      showError("操作失败，请稍后再试");
    } finally {
      checkinSaving.value = false;
    }
  }

  async function submitGeneralNote() {
    if (checkinSaving.value) return;
    if (!authState.token || !checkinSlotKey.value) return;
    const text = checkinContent.value.trim();
    if (!text) {
      showError("请填写一句备注（可选，但这里需要有内容才能提交）");
      return;
    }
    checkinSaving.value = true;
    try {
      const idem = `note:${planId.value}:${checkinSlotKey.value}:${Date.now()}:${Math.random()
        .toString(16)
        .slice(2)}`;
      const { submission } = await getApiClient().postPlanScheduleSlotCheckin({
        id: planId.value,
        slotKey: checkinSlotKey.value,
        token: authState.token,
        content: text,
        idempotencyKey: idem,
      });
      const slot = checkinSlotKey.value;
      const cur = { ...(plan.value?.scheduleSlotSubmissions ?? {}) };
      cur[slot] = [submission, ...(cur[slot] ?? [])];
      if (plan.value) plan.value = { ...plan.value, scheduleSlotSubmissions: cur };
      trackEvent("checkin_submit", {
        properties: {
          planId: planId.value,
          slotKey: slot,
          variant: "general_note",
        },
      });
      okBanner.value = "已保存备注";
      window.setTimeout(() => (okBanner.value = ""), 3000);
      checkinContent.value = "";
      checkinReview.value = null;
      checkinAppealText.value = "";
    } catch (e) {
      showError(e instanceof Error ? e.message : "没保存成功，请稍后再试");
    } finally {
      checkinSaving.value = false;
    }
  }

  watch(
    [checkinContent, checkinUploadedFiles, checkinManualLinks],
    () => {
      checkinReview.value = null;
    },
    { deep: true },
  );

  watch(
    [checkinOpen, checkinContent, checkinUploadedFiles, checkinManualLinks],
    () => {
      if (!checkinOpen.value) return;
      const sk = checkinSlotKey.value;
      if (!sk) return;
      if (checkinDraftSaveTimer) clearTimeout(checkinDraftSaveTimer);
      checkinDraftSaveTimer = setTimeout(() => {
        checkinDraftSaveTimer = null;
        try {
          localStorage.setItem(
            checkinDraftStorageKey(sk),
            JSON.stringify({
              content: checkinContent.value,
              uploaded: checkinUploadedFiles.value,
              manual: checkinManualLinks.value,
            }),
          );
        } catch {
          /* 可能超出配额 */
        }
      }, 500);
    },
    { deep: true },
  );

  function removeCheckinUploaded(idx: number) {
    checkinUploadedFiles.value.splice(idx, 1);
  }

  function removeCheckinManualRow(idx: number) {
    checkinManualLinks.value.splice(idx, 1);
    if (checkinManualLinks.value.length === 0) {
      checkinManualLinks.value.push({ url: "", fileName: "" });
    }
  }

  function mergedCheckinAttachmentsOrThrow(): Array<{ url: string; fileName?: string }> {
    return mergeCheckinAttachments({
      uploaded: checkinUploadedFiles.value,
      manualLinks: checkinManualLinks.value,
      maxFiles: CHECKIN_MAX_FILES,
    });
  }

  function onCheckinDrop(e: DragEvent) {
    checkinDropActive.value = false;
    const files = e.dataTransfer?.files;
    if (files?.length) void onCheckinFilesPicked(files);
  }

  function addCheckinManualLinkRow() {
    checkinManualLinks.value.push({ url: "", fileName: "" });
  }

  async function onCheckinFilesPicked(files: FileList | null) {
    if (!files?.length || !authState.token) return;
    const arr = Array.from(files);
    const remaining = Math.max(0, CHECKIN_MAX_FILES - checkinUploadedFiles.value.length);
    if (remaining <= 0) {
      showError(`最多上传 ${CHECKIN_MAX_FILES} 个文件（可先移除部分后再试）`);
      return;
    }
    const sliced = arr.slice(0, remaining);
    const rejectedTooLarge = sliced.filter((f) => f.size > CHECKIN_MAX_FILE_SIZE_BYTES);
    if (rejectedTooLarge.length > 0) {
      showError(`单文件不超过 15MB（有 ${rejectedTooLarge.length} 个文件过大）`);
      return;
    }
    const rejectedType = sliced.filter((f) => !isAllowedCheckinFile(f));
    if (rejectedType.length > 0) {
      showError(`有 ${rejectedType.length} 个文件类型不支持，请改为图片/PDF/Word/文本等`);
      return;
    }
    checkinFileUploading.value = true;
    checkinUploadProgress.value = "";
    try {
      const total = sliced.length;
      for (let i = 0; i < total; i++) {
        if (total > 1) checkinUploadProgress.value = `${i + 1} / ${total}`;
        const f = sliced[i]!;
        const res = await getApiClient().uploadUserFile({
          token: authState.token,
          file: f,
        });
        checkinUploadedFiles.value.push({
          url: res.url,
          fileName: res.fileName || f.name,
        });
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : "没上传成功，请稍后再试");
    } finally {
      checkinUploadProgress.value = "";
      checkinFileUploading.value = false;
    }
  }

  async function submitCheckin() {
    if (checkinSaving.value) return;
    if (!authState.token || !checkinSlotKey.value) return;
    let atts: Array<{ url: string; fileName?: string }> = [];
    try {
      atts = mergedCheckinAttachmentsOrThrow();
    } catch (e) {
      showError(e instanceof Error ? e.message : "请检查链接格式");
      return;
    }
    const text = checkinContent.value.trim();
    if (!text && atts.length === 0) {
      showError("还差一点：请填写说明、上传文件，或添加至少一条链接");
      return;
    }
    checkinSaving.value = true;
    try {
      const idem = `checkin:${planId.value}:${checkinSlotKey.value}:${Date.now()}:${Math.random()
        .toString(16)
        .slice(2)}`;
      const { submission } = await getApiClient().postPlanScheduleSlotCheckin({
        id: planId.value,
        slotKey: checkinSlotKey.value,
        token: authState.token,
        content: text || undefined,
        attachments: atts.length ? atts : undefined,
        idempotencyKey: idem,
      });
      const slot = checkinSlotKey.value;
      trackEvent("checkin_submit", {
        properties: {
          planId: planId.value,
          slotKey: slot,
          variant: isTravelPlan.value ? "travel_record" : "proof",
        },
      });
      clearCheckinDraftForSlot(slot);
      const cur = { ...(plan.value?.scheduleSlotSubmissions ?? {}) };
      cur[slot] = [submission, ...(cur[slot] ?? [])];
      if (plan.value)
        plan.value = { ...plan.value, scheduleSlotSubmissions: cur };
      if (isTravelPlan.value) {
        okBanner.value = "已添加记录";
        window.setTimeout(() => {
          okBanner.value = "";
        }, 3000);
        checkinContent.value = "";
        checkinUploadedFiles.value = [];
        checkinManualLinks.value = [{ url: "", fileName: "" }];
        checkinReview.value = null;
        checkinAppealText.value = "";
      } else {
        checkinOpen.value = false;
        checkinReview.value = null;
      }
    } catch (e) {
      if (!isTravelPlan.value && e instanceof HttpApiError && e.status === 422) {
        const body = e.body as
          | { review?: CheckinPublicReview }
          | null
          | undefined;
        if (body && body.review && Array.isArray(body.review.dimensions)) {
          checkinReview.value = body.review;
          showError(body.review.summary || e.message);
          return;
        }
      }
      checkinReview.value = null;
      showError(
        isTravelPlan.value
          ? "没操作成功，请稍后再试"
          : e instanceof Error
            ? e.message
            : "没提交成功，请稍后再试",
      );
    } finally {
      checkinSaving.value = false;
    }
  }

  async function submitCheckinAppeal() {
    if (!authState.token || !checkinSlotKey.value) return;
    const t = checkinAppealText.value.trim();
    if (t.length < 4) {
      showError("请至少填写 4 个字的申诉说明");
      return;
    }
    appealSubmitting.value = true;
    try {
      const merged = mergedCheckinAttachmentsOrThrow();
      const r = await getApiClient().postPlanScheduleSlotAppeal({
        id: planId.value,
        slotKey: checkinSlotKey.value,
        token: authState.token,
        content: t,
        proofContent: checkinContent.value.trim() || undefined,
        proofAttachments: merged.length
          ? merged.map((a) => ({
              url: a.url,
              ...(a.fileName ? { fileName: a.fileName } : {}),
            }))
          : undefined,
        lastReview: checkinReview.value ?? undefined,
      });
      checkinOpen.value = false;
      checkinReview.value = null;
      checkinAppealText.value = "";
      if (r.outcome === "ai_approved" && r.submission && plan.value) {
        const slot = checkinSlotKey.value;
        const cur = { ...(plan.value.scheduleSlotSubmissions ?? {}) };
        cur[slot] = [r.submission, ...(cur[slot] ?? [])];
        plan.value = { ...plan.value, scheduleSlotSubmissions: cur };
      }
      okBanner.value =
        r.outcome === "ai_approved"
          ? `AI 预审已通过申诉，本打卡段已自动完成。${r.aiRationale ? `（${r.aiRationale}）` : ""}`
          : `申诉已提交。${r.aiRationale ? `${r.aiRationale} ` : ""}未通过 AI 预审或需复核的将进入人工队列；该槽在人工处理前显示「申诉中」，也可先撤销申诉再补充材料。`;
      window.setTimeout(() => {
        okBanner.value = "";
      }, 5000);
      await loadPlanDetail();
    } catch (e) {
      showError(e instanceof Error ? e.message : "没提交成功，请稍后再试");
    } finally {
      appealSubmitting.value = false;
    }
  }

  async function withdrawSlotAppeal(slotKey: string) {
    if (!authState.token) return;
    appealWithdrawKey.value = slotKey;
    try {
      await getApiClient().deletePlanScheduleSlotAppeal({
        id: planId.value,
        slotKey,
        token: authState.token,
      });
      await loadPlanDetail();
      okBanner.value =
        "已撤销申诉。可以重新打开「提交证明」补充内容后再次尝试，或再次发起申诉。";
      window.setTimeout(() => {
        okBanner.value = "";
      }, 6000);
    } catch (e) {
      showError(e instanceof Error ? e.message : "没撤销成功，请稍后再试");
    } finally {
      appealWithdrawKey.value = null;
    }
  }

  return {
    checkinOpen,
    checkinSlotKey,
    checkinSlotPlanText,
    checkinContent,
    checkinUploadedFiles,
    checkinManualLinks,
    checkinSaving,
    checkinFileUploading,
    checkinDropActive,
    checkinUploadProgress,
    checkinReview,
    checkinAppealText,
    appealSubmitting,
    appealWithdrawKey,
    submissionDrawerOpen,
    submissionDrawerSlotKey,
    submissionDrawerPlanText,
    checkinBandLabel,
    slotCheckinStateLabel,
    slotCheckinStatePillClass,
    slotSubmissionSummary,
    openCheckinSubmit,
    openTravelRecordDrawer,
    openGeneralNoteDrawer,
    openSubmissionHistory,
    toggleTravelSlotCompletion,
    submitGeneralNote,
    removeCheckinUploaded,
    removeCheckinManualRow,
    onCheckinDrop,
    addCheckinManualLinkRow,
    onCheckinFilesPicked,
    submitCheckin,
    submitCheckinAppeal,
    withdrawSlotAppeal,
  };
}
