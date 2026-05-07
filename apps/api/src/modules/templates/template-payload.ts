/**
 * PresetTemplate.payload / MarketTemplate 等业务里嵌套的「计划种子」JSON。
 *
 * parseTemplatePayload：白名单字段 + 类型检查，失败返回 { ok:false, message } 供路由转 4xx/5xx。
 * templatePayloadToCreateInput：转成 createGeneratedPlan 需要的字段（含 userId 由调用方传入）。
 */
import type { GeneratePlanInput } from '@ai-plan/ai-engine/client';
import type { GranularityMode } from '../plans/granularity';

export type TemplatePlanPayload = {
  goal: string;
  deadline: string;
  requirement: string;
  type: GeneratePlanInput['type'];
  granularityMode?: GranularityMode;
  startDateIso?: string;
};

const planTypes = ['general', 'study', 'work'] as const;

function isGranularityMode(v: unknown): v is GranularityMode {
  return v === 'smart' || v === 'deep' || v === 'rough';
}

export function parseTemplatePayload(
  raw: unknown,
): { ok: true; data: TemplatePlanPayload } | { ok: false; message: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, message: '模板 payload 必须是对象' };
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.goal !== 'string' || !o.goal.trim()) {
    return { ok: false, message: '模板 payload 缺少 goal（目标）' };
  }
  if (typeof o.requirement !== 'string' || !o.requirement.trim()) {
    return { ok: false, message: '模板 payload 缺少 requirement（计划内容）' };
  }
  if (typeof o.deadline !== 'string' || Number.isNaN(new Date(o.deadline).getTime())) {
    return { ok: false, message: '模板 payload.deadline 必须是有效日期' };
  }
  if (typeof o.type !== 'string' || !planTypes.includes(o.type as (typeof planTypes)[number])) {
    return { ok: false, message: '模板 payload.type 必须是 general / study / work' };
  }
  const granularityMode = isGranularityMode(o.granularityMode) ? o.granularityMode : undefined;
  const startDateIso =
    typeof o.startDateIso === 'string' && !Number.isNaN(new Date(o.startDateIso).getTime())
      ? o.startDateIso
      : undefined;

  return {
    ok: true,
    data: {
      goal: o.goal.trim(),
      deadline: o.deadline,
      requirement: o.requirement.trim(),
      type: o.type as GeneratePlanInput['type'],
      granularityMode,
      startDateIso,
    },
  };
}

export function templatePayloadToCreateInput(data: TemplatePlanPayload, userId: string) {
  return {
    userId,
    goal: data.goal,
    deadline: data.deadline,
    requirement: data.requirement,
    type: data.type,
    granularityMode: data.granularityMode,
    startDateIso: data.startDateIso ?? data.deadline,
  };
}
