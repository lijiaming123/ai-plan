import {
  formatApiErrorForUser,
  formatHttpApiUserMessage,
} from "../../api-error-message";
import {
  HttpApiError,
  joinUrl,
  readHttpErrorPayload,
  type RequestFn,
} from "../http";
import type {
  ArchivedPlanListRow,
  CheckinPublicReview,
  CreatePlanInput,
  CreateSubmissionInput,
  DeletedPlanListRow,
  ParsePlanFileInput,
  ParsePlanFileResult,
  PlanAssistantApplyOptionInput,
  PlanAssistantApplyOptionResult,
  PlanAssistantInput,
  PlanAssistantResult,
  PlanDraftSessionPayload,
  PlanListRow,
  PlanRecord,
  ScheduleSlotCheckinRecord,
  SlotAppealResponse,
  SubmissionRecord,
} from "../types/plans.types";

export type PlansApiDeps = {
  baseURL: string;
  fetchImpl: typeof fetch;
};

export type PlansApi = {
  listPlans(input: {
    token: string;
    /** `deadline`：按截止日期升序（更近的在前）。默认按创建时间倒序。 */
    sort?: "created" | "deadline";
  }): Promise<{ plans: PlanListRow[] }>;
  deletePlan(input: { id: string; token: string }): Promise<{ ok: true }>;
  restorePlan(input: { id: string; token: string }): Promise<{ ok: true }>;
  listDeletedPlans(input: {
    token: string;
  }): Promise<{ plans: DeletedPlanListRow[] }>;
  listArchivedPlans(input: {
    token: string;
    sort?: "created" | "deadline";
    limit?: number;
    offset?: number;
    /** 按目标（goal）模糊匹配，服务端过滤 */
    search?: string;
  }): Promise<{ plans: ArchivedPlanListRow[]; hasMore: boolean }>;
  archivePlan(input: { id: string; token: string }): Promise<{ ok: true }>;
  unarchivePlan(input: { id: string; token: string }): Promise<{ ok: true }>;
  createPlan(input: CreatePlanInput): Promise<PlanRecord>;
  createSubmission(input: CreateSubmissionInput): Promise<SubmissionRecord>;
  planAssistant(input: PlanAssistantInput): Promise<PlanAssistantResult>;
  planAssistantApplyOption(
    input: PlanAssistantApplyOptionInput,
  ): Promise<PlanAssistantApplyOptionResult>;
  parsePlanFile(input: ParsePlanFileInput): Promise<ParsePlanFileResult>;
  getPlan(input: { id: string; token: string }): Promise<PlanRecord>;
  /** 更新已定稿计划的有限字段（当前支持 nextStep） */
  patchPlan(input: {
    id: string;
    token: string;
    nextStep?: string;
  }): Promise<{ nextStep: string | null }>;
  getPlanDraft(input: {
    id: string;
    token: string;
  }): Promise<PlanDraftSessionPayload>;
  patchPlanScheduleSlot(input: {
    id: string;
    slotKey: string;
    token: string;
    content?: string;
    restore?: boolean;
    /** 草稿多版本时指定 PlanVersion.version，避免误改 currentVersion 对应行 */
    version?: number;
  }): Promise<{
    schedule: NonNullable<
      NonNullable<PlanRecord["draft"]>["versions"][number]["schedule"]
    >;
    slot: NonNullable<
      NonNullable<PlanRecord["draft"]>["versions"][number]["schedule"]
    >["slots"][number];
  }>;
  postPlanScheduleSwapContent(input: {
    id: string;
    token: string;
    slotKeyA: string;
    slotKeyB: string;
    /** 草稿多版本时指定 PlanVersion.version，避免误改 currentVersion 对应行 */
    version?: number;
  }): Promise<{
    schedule: NonNullable<
      NonNullable<PlanRecord["draft"]>["versions"][number]["schedule"]
    >;
    slots: {
      slotA: NonNullable<
        NonNullable<PlanRecord["draft"]>["versions"][number]["schedule"]
      >["slots"][number];
      slotB: NonNullable<
        NonNullable<PlanRecord["draft"]>["versions"][number]["schedule"]
      >["slots"][number];
    };
  }>;
  postPlanScheduleSlotCheckin(input: {
    id: string;
    slotKey: string;
    token: string;
    content?: string;
    attachments?: Array<{ url: string; fileName?: string; kind?: string }>;
    /** 客户端幂等键（服务端支持时可用于去重；不支持也不会影响兼容性） */
    idempotencyKey?: string;
  }): Promise<{ submission: ScheduleSlotCheckinRecord }>;
  /** DELETE .../checkins：撤销本打卡段的完成记录（通常仅删除最新一次/当前有效记录） */
  deletePlanScheduleSlotCheckin(input: {
    id: string;
    slotKey: string;
    token: string;
  }): Promise<{ ok: true }>;
  postPlanScheduleSlotAppeal(input: {
    id: string;
    slotKey: string;
    token: string;
    content: string;
    proofContent?: string;
    proofAttachments?: Array<{ url: string; fileName?: string; kind?: string }>;
    lastReview?: CheckinPublicReview;
  }): Promise<SlotAppealResponse>;
  deletePlanScheduleSlotAppeal(input: {
    id: string;
    slotKey: string;
    token: string;
  }): Promise<{ ok: true }>;
  regeneratePlan(input: {
    id: string;
    token: string;
    requirement?: string;
    granularityMode?: "smart" | "deep" | "rough";
  }): Promise<{
    versions: NonNullable<PlanRecord["draft"]>["versions"];
    maxVersions: number;
    confirmedVersion: number | null;
    canRegenerate: boolean;
  }>;
  confirmPlan(input: { id: string; token: string; version: number }): Promise<{
    plan: PlanRecord;
    confirmedVersion: number;
  }>;
  comparePlanVersions(input: {
    id: string;
    token: string;
    base: number;
    target: number;
  }): Promise<{
    baseVersion: number;
    targetVersion: number;
    addedStages: string[];
    removedStages: string[];
    addedTasks: string[];
    removedTasks: string[];
  }>;
  /** multipart 单文件，字段名 `file`；返回可写入提交的公开 URL */
  uploadUserFile(input: {
    token: string;
    file: File;
  }): Promise<{ path: string; url: string; fileName: string; kind: string }>;
};

export function createPlansApi(
  request: RequestFn,
  deps: PlansApiDeps,
): PlansApi {
  const { baseURL, fetchImpl } = deps;

  return {
    listPlans(input) {
      const params = new URLSearchParams();
      if (input.sort === "deadline") {
        params.set("sort", "deadline");
      } else if (input.sort === "created") {
        params.set("sort", "created");
      }
      const qs = params.toString();
      return request<{ plans: PlanListRow[] }>(`/plans${qs ? `?${qs}` : ""}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    deletePlan(input) {
      return request<{ ok: true }>(`/plans/${input.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    restorePlan(input) {
      return request<{ ok: true }>(`/plans/${input.id}/restore`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    listDeletedPlans(input) {
      return request<{ plans: DeletedPlanListRow[] }>(`/plans/trash`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    listArchivedPlans(input) {
      const params = new URLSearchParams();
      const limit = input.limit ?? 20;
      const offset = input.offset ?? 0;
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (input.sort === "deadline") {
        params.set("sort", "deadline");
      } else if (input.sort === "created") {
        params.set("sort", "created");
      }
      const trimmed = input.search?.trim();
      if (trimmed) {
        params.set("search", trimmed);
      }
      const qs = params.toString();
      return request<{ plans: ArchivedPlanListRow[]; hasMore: boolean }>(
        `/plans/archive?${qs}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${input.token}`,
          },
        },
      );
    },
    archivePlan(input) {
      return request<{ ok: true }>(`/plans/${input.id}/archive`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    unarchivePlan(input) {
      return request<{ ok: true }>(`/plans/${input.id}/unarchive`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    createPlan(input) {
      return request<PlanRecord>("/plans", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
        body: JSON.stringify({
          goal: input.goal,
          deadline: input.deadline,
          requirement: input.requirement,
          type: input.type,
          profile: input.profile,
          ...(input.parentPlanId?.trim()
            ? { parentPlanId: input.parentPlanId.trim() }
            : {}),
        }),
      });
    },
    createSubmission(input) {
      return request<SubmissionRecord>(`/tasks/${input.taskId}/submissions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
        body: JSON.stringify({
          content: input.content,
          imageUrls: input.imageUrls,
        }),
      });
    },
    planAssistant(input) {
      return request<PlanAssistantResult>("/plans/assistant", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
        body: JSON.stringify({
          mode: input.mode,
          goal: input.goal,
          requirement: input.requirement,
          startDate: input.startDate,
          cycle: input.cycle,
          endDate: input.endDate,
          granularityMode: input.granularityMode,
          message: input.message,
          tier: input.tier,
          agent: input.agent,
        }),
      });
    },
    planAssistantApplyOption(input) {
      return request<PlanAssistantApplyOptionResult>(
        "/plans/assistant/apply-option",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.token}`,
          },
          body: JSON.stringify({
            baseSuggestedContent: input.baseSuggestedContent,
            baseSchedule: input.baseSchedule,
            optionId: input.optionId,
            customText: input.customText,
            context: input.context,
          }),
        },
      );
    },
    parsePlanFile(input) {
      return request<ParsePlanFileResult>("/plans/parse-file", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
        body: JSON.stringify({
          fileName: input.fileName,
          contentBase64: input.contentBase64,
        }),
      });
    },
    getPlan(input) {
      return request<PlanRecord>(`/plans/${input.id}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    patchPlan(input) {
      const body: Record<string, string> = {};
      if (input.nextStep !== undefined) body.nextStep = input.nextStep;
      return request<{ nextStep: string | null }>(`/plans/${input.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
        body: JSON.stringify(body),
      });
    },
    getPlanDraft(input) {
      return request<PlanDraftSessionPayload>(`/plans/${input.id}/draft`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    patchPlanScheduleSlot(input) {
      return request<{
        schedule: NonNullable<
          NonNullable<PlanRecord["draft"]>["versions"][number]["schedule"]
        >;
        slot: NonNullable<
          NonNullable<PlanRecord["draft"]>["versions"][number]["schedule"]
        >["slots"][number];
      }>(
        `/plans/${input.id}/schedule/slots/${encodeURIComponent(input.slotKey)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${input.token}`,
          },
          body: JSON.stringify({
            content: input.content,
            restore: input.restore,
            version: input.version,
          }),
        },
      );
    },
    postPlanScheduleSwapContent(input) {
      return request<{
        schedule: NonNullable<
          NonNullable<PlanRecord["draft"]>["versions"][number]["schedule"]
        >;
        slots: {
          slotA: NonNullable<
            NonNullable<PlanRecord["draft"]>["versions"][number]["schedule"]
          >["slots"][number];
          slotB: NonNullable<
            NonNullable<PlanRecord["draft"]>["versions"][number]["schedule"]
          >["slots"][number];
        };
      }>(`/plans/${input.id}/schedule/slots/swap-content`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
        body: JSON.stringify({
          slotKeyA: input.slotKeyA,
          slotKeyB: input.slotKeyB,
          version: input.version,
        }),
      });
    },
    postPlanScheduleSlotCheckin(input) {
      const hasPayload =
        (input.content != null && String(input.content).trim().length > 0) ||
        (Array.isArray(input.attachments) && input.attachments.length > 0);
      return request<{ submission: ScheduleSlotCheckinRecord }>(
        `/plans/${input.id}/schedule/slots/${encodeURIComponent(input.slotKey)}/checkins`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.token}`,
            ...(input.idempotencyKey
              ? { "Idempotency-Key": input.idempotencyKey }
              : {}),
          },
          body: hasPayload
            ? JSON.stringify({
                content: input.content,
                attachments: input.attachments,
              })
            : undefined,
        },
      );
    },
    deletePlanScheduleSlotCheckin(input) {
      return request<{ ok: true }>(
        `/plans/${input.id}/schedule/slots/${encodeURIComponent(input.slotKey)}/checkins`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${input.token}`,
          },
        },
      );
    },
    postPlanScheduleSlotAppeal(input) {
      return request<SlotAppealResponse>(
        `/plans/${input.id}/schedule/slots/${encodeURIComponent(input.slotKey)}/appeals`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.token}`,
          },
          body: JSON.stringify({
            content: input.content,
            ...(input.proofContent != null ? { proofContent: input.proofContent } : {}),
            ...(input.proofAttachments != null && input.proofAttachments.length
              ? { proofAttachments: input.proofAttachments }
              : {}),
            ...(input.lastReview != null ? { lastReview: input.lastReview } : {}),
          }),
        },
      );
    },
    deletePlanScheduleSlotAppeal(input) {
      return request<{ ok: true }>(
        `/plans/${input.id}/schedule/slots/${encodeURIComponent(input.slotKey)}/appeals`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${input.token}`,
          },
        },
      );
    },
    regeneratePlan(input) {
      return request<{
        versions: NonNullable<PlanRecord["draft"]>["versions"];
        maxVersions: number;
        confirmedVersion: number | null;
        canRegenerate: boolean;
      }>(`/plans/${input.id}/regenerate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
        body: JSON.stringify({
          requirement: input.requirement,
          granularityMode: input.granularityMode,
        }),
      });
    },
    confirmPlan(input) {
      return request<{
        plan: PlanRecord;
        confirmedVersion: number;
      }>(`/plans/${input.id}/confirm`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
        body: JSON.stringify({
          version: input.version,
        }),
      });
    },
    comparePlanVersions(input) {
      const query = `base=${input.base}&target=${input.target}`;
      return request<{
        baseVersion: number;
        targetVersion: number;
        addedStages: string[];
        removedStages: string[];
        addedTasks: string[];
        removedTasks: string[];
      }>(`/plans/${input.id}/compare?${query}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    async uploadUserFile(input) {
      const fd = new FormData();
      fd.append("file", input.file);
      let response: Response;
      try {
        response = await fetchImpl(joinUrl(baseURL, "/uploads"), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.token}`,
          },
          body: fd,
        });
      } catch (e) {
        throw new Error(formatApiErrorForUser(e));
      }
      if (!response.ok) {
        const { message } = await readHttpErrorPayload(response);
        throw new HttpApiError(
          formatHttpApiUserMessage(response.status, message),
          response.status,
          undefined,
        );
      }
      return (await response.json()) as {
        path: string;
        url: string;
        fileName: string;
        kind: string;
      };
    },
  };
}
