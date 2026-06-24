import type { RequestFn } from "../http";
import type {
  PlanAssistantContextResponse,
  PlanAssistantProfilePatchInput,
  PlanHeatmapResponse,
  UserInsightsResponse,
} from "../types/me.types";

export type MeApi = {
  getPlanHeatmap(input: {
    token: string;
    year?: number;
  }): Promise<PlanHeatmapResponse>;
  getUserInsights(input: { token: string }): Promise<UserInsightsResponse>;
  getPlanAssistantContext(input: {
    token: string;
  }): Promise<PlanAssistantContextResponse>;
  patchPlanAssistantProfile(
    input: PlanAssistantProfilePatchInput,
  ): Promise<PlanAssistantContextResponse>;
  postPlanAssistantPinNote(input: {
    token: string;
    text: string;
  }): Promise<PlanAssistantContextResponse>;
};

export function createMeApi(request: RequestFn): MeApi {
  return {
    getPlanHeatmap(input) {
      const q =
        input.year != null
          ? `?year=${encodeURIComponent(String(input.year))}`
          : "";
      return request<PlanHeatmapResponse>(`/me/plan-heatmap${q}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    getUserInsights(input) {
      return request<UserInsightsResponse>("/me/insights", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    getPlanAssistantContext(input) {
      return request<PlanAssistantContextResponse>("/me/plan-assistant-context", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
      });
    },
    patchPlanAssistantProfile(input) {
      const { token, ...body } = input;
      return request<PlanAssistantContextResponse>("/me/plan-assistant-profile", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    },
    postPlanAssistantPinNote(input) {
      return request<PlanAssistantContextResponse>(
        "/me/plan-assistant-profile/pin-note",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.token}`,
          },
          body: JSON.stringify({ text: input.text }),
        },
      );
    },
  };
}
