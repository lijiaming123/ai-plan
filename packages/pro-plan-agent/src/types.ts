export type ProAgentMode = 'draft' | 'chat';

export type ProAgentInput = {
  userId: string;
  mode: ProAgentMode;
  goal: string;
  requirement: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  cycle: string;
  granularityMode?: 'smart' | 'deep' | 'rough';
  message?: string; // chat mode
};

export type ScheduleGranularity = 'day' | 'week';

export type CheckinSpec = {
  criteria: string[];
  evidenceHint?: string;
};

export type ScheduleWire = {
  schedule: {
    granularity: ScheduleGranularity;
    slots: Array<{ slotKey: string; content: string; checkinSpec?: unknown }>;
  };
};

export type Schedule = {
  granularity: ScheduleGranularity;
  slots: Array<{
    slotKey: string;
    generatedContent: string;
    content: string;
    contentSource: 'generated' | 'edited';
    checkinSpec?: CheckinSpec;
  }>;
};

export type LlmLike = {
  complete: (params: { task: 'pro_plan_draft' | 'pro_plan_critique' | 'pro_plan_patch' | 'pro_plan_render'; messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>; cacheKey: string }) => Promise<{ text: string; providerId?: string; cached?: boolean }>;
};

export type ReviewIssue = {
  code: 'missing_acceptance' | 'missing_evidence' | 'too_vague' | 'overloaded' | 'missing_risk' | 'schedule_mismatch' | 'other';
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  suggestion: string;
};

export type ReviewResult = {
  scoreTotal: number; // 0-100
  scoreBreakdown: {
    executability: number;
    clarity: number;
    riskControl: number;
    rhythm: number;
  };
  issues: ReviewIssue[];
  summary: string;
};

export type ProOption = {
  id: 'more_granular' | 'save_time' | 'more_steady' | 'more_aggressive';
  title: string;
  pros: string[];
  cons: string[];
  promptHint: string;
};

export type ProAgentRunResult = {
  draft: { reply: string; suggestedContent: string; schedule: Schedule; assumptions: string[] };
  review: ReviewResult;
  revised: { suggestedContent: string; schedule: Schedule; diffSummary: string[] };
  options: ProOption[];
};

