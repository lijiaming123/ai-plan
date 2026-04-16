export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

/** 路由任务：决定模型档位、超时、缓存策略等 */
export type LlmTask = "plan_assistant" | "plan_regenerate" | "copy_polish";

export type LlmCompleteResult = {
  text: string;
  providerId: string;
  cached: boolean;
  ms: number;
};

export type LlmProvider = {
  id: string;
  complete: (params: {
    task: LlmTask;
    messages: LlmMessage[];
    timeoutMs?: number;
  }) => Promise<string>;
};

