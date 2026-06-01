/**
 * 用户提交打卡申诉后的 AI 预审：通过则无需人工；否则进入人工队列。
 */
import { completeDeepseekChat, isDeepseekConfigured } from "../../lib/deepseek";
import type { CheckinPublicReview } from "./checkin-submission-score.service";

export type AppealScreeningInput = {
  planGoal: string;
  slotContent: string;
  appealText: string;
  proofText: string;
  proofAttachmentCount: number;
  lastReview?: CheckinPublicReview | null;
};

export type AppealScreeningVerdict = "approve" | "escalate";

function parseAppealAiJson(raw: string): { decision: string; rationale?: string } | null {
  const t = raw.trim();
  const tryParse = (s: string) => {
    try {
      const o = JSON.parse(s) as Record<string, unknown>;
      const decision = typeof o.decision === "string" ? o.decision.toLowerCase().trim() : "";
      const rationale = typeof o.rationale === "string" ? o.rationale : "";
      return { decision, rationale };
    } catch {
      return null;
    }
  };
  const direct = tryParse(t);
  if (direct && (direct.decision === "approve" || direct.decision === "escalate")) return direct;
  const m = t.match(/\{[^]*"decision"[^]*\}/);
  if (m?.[0]) {
    const inner = tryParse(m[0]);
    if (inner && (inner.decision === "approve" || inner.decision === "escalate")) return inner;
  }
  return null;
}

export async function runAppealAiScreening(
  input: AppealScreeningInput,
): Promise<{ decision: AppealScreeningVerdict; rationale: string }> {
  const mock = process.env.APPEAL_AI_MOCK_VERDICT?.trim().toLowerCase();
  if (mock === "approve" || mock === "escalate") {
    return {
      decision: mock,
      rationale: mock === "approve" ? "（测试：强制通过）" : "（测试：强制人工）",
    };
  }

  if (!isDeepseekConfigured()) {
    return {
      decision: "escalate",
      rationale: "当前未配置可用的云端 AI，已为你转入人工审核队列。",
    };
  }

  const reviewBlock =
    input.lastReview && typeof input.lastReview.summary === "string"
      ? [
          "【自动核验结论摘要】",
          input.lastReview.summary,
          "",
          ...input.lastReview.dimensions.map((d) => {
            const bandCn =
              d.band === "low" ? "偏低" : d.band === "mid" ? "一般" : "良好";
            return `- ${d.label}（${bandCn}）：${d.hint}`;
          }),
        ].join("\n")
      : "【无结构化核验详情】";

  const user = [
    `【计划目标】${input.planGoal.slice(0, 600)}`,
    `【本时间槽任务说明】${input.slotContent.slice(0, 800)}`,
    "",
    reviewBlock,
    "",
    `【用户申诉理由】${input.appealText}`,
    `【用户当时提交的完成说明（与再次提交证明相关）】${input.proofText || "（未附带）"}`,
    `【附件数量】${input.proofAttachmentCount}`,
    "",
    "请仅输出一行 JSON，勿输出其它文字：",
    '{"decision":"approve"|"escalate","rationale":"不超过180字，说明理由"}',
    "规则：若申诉理由与材料足以推翻或明显动摇自动核验结论，decision 取 approve；否则取 escalate 转人工。",
  ].join("\n");

  try {
    const raw = await completeDeepseekChat(
      [
        {
          role: "system",
          content:
            "你是公正、保守的审核助理。输出必须是合法 JSON 一行，字段 decision 与 rationale；decision 只能是 approve 或 escalate。",
        },
        { role: "user", content: user },
      ],
      { temperature: 0.2 },
    );
    const parsed = parseAppealAiJson(raw);
    if (parsed?.decision === "approve" || parsed?.decision === "escalate") {
      return {
        decision: parsed.decision,
        rationale:
          (parsed.rationale ?? "").trim().slice(0, 500) || "（模型未给出理由）",
      };
    }
  } catch {
    // fall through
  }

  return {
    decision: "escalate",
    rationale: "AI 预审暂不可用或结果无法解析，已转入人工审核。",
  };
}
