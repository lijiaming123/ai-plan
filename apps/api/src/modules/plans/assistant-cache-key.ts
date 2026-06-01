import crypto from "node:crypto";

function sha1(text: string): string {
  return crypto.createHash("sha1").update(text).digest("hex");
}

export function buildPlanAssistantCacheKey(params: {
  mode: "draft" | "chat";
  goal: string;
  requirement: string;
  startDate: string;
  endDate: string;
  cycle: string;
  message?: string;
  granularityMode?: string;
  /** 与 Pro Agent memoryPrefix 对齐，避免同表单不同记忆命中错误缓存 */
  memoryPrefix?: string;
}): string {
  const base = JSON.stringify({
    mode: params.mode,
    goal: params.goal,
    requirement: params.requirement,
    memoryPrefix: params.memoryPrefix ?? "",
    startDate: params.startDate,
    endDate: params.endDate,
    cycle: params.cycle,
    message: params.message ?? "",
    granularityMode: params.granularityMode ?? "",
  });
  return `plan-assistant:${params.mode}:${sha1(base)}`;
}

