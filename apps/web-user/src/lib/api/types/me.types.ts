import type { AiQuotaSnapshot } from "./auth.types";

export type PlanHeatmapDay = {
  date: string;
  status: "completed" | "missed" | "pending" | "none";
  summary?: { due: number; done: number };
};

export type PlanHeatmapResponse = {
  year: number;
  timeZone: string;
  days: PlanHeatmapDay[];
};

/** GET /me/insights */
export type UserInsightsResponse = {
  activePlans: number;
  weekCheckinsCompleted: number;
  avgProgressPercent: number;
  weeklyCheckinTrend: number[];
  weekRangeLabel: string;
};

/** GET /me/plan-assistant-context、PATCH /me/plan-assistant-profile */
export type PlanAssistantProfileApi = {
  tone: string | null;
  language: string | null;
  weeklyHoursCap: number | null;
  preferMorning: boolean | null;
  evidenceTolerance: string | null;
  defaultScenario: string | null;
  pinnedNotes: string[];
};

export type PlanAssistantContextResponse = {
  profile: PlanAssistantProfileApi;
  completionSummary: string;
  quotaHint: AiQuotaSnapshot | null;
};

export type PlanAssistantProfilePatchInput = {
  token: string;
  tone?: "concise" | "detailed" | null;
  language?: "zh" | null;
  weeklyHoursCap?: number | null;
  preferMorning?: boolean | null;
  evidenceTolerance?: "low" | "medium" | null;
  defaultScenario?: "study" | "work" | "travel" | "general" | null;
  pinnedNotes?: string[];
};
