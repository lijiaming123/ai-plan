import {
  completeDeepseekChat,
  isDeepseekConfigured,
  type DeepseekChatMessage,
} from "../../deepseek";
import type { LlmProvider } from "../llm-types";

export function createDeepseekProvider(): LlmProvider {
  return {
    id: "deepseek",
    async complete(params) {
      if (!isDeepseekConfigured()) {
        throw new Error("deepseek not configured");
      }
      const messages = params.messages as DeepseekChatMessage[];
      return completeDeepseekChat(messages);
    },
  };
}

