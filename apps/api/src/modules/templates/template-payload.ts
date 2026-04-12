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
    return { ok: false, message: 'payload must be an object' };
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.goal !== 'string' || !o.goal.trim()) {
    return { ok: false, message: 'payload.goal is required' };
  }
  if (typeof o.requirement !== 'string' || !o.requirement.trim()) {
    return { ok: false, message: 'payload.requirement is required' };
  }
  if (typeof o.deadline !== 'string' || Number.isNaN(new Date(o.deadline).getTime())) {
    return { ok: false, message: 'payload.deadline must be a valid date string' };
  }
  if (typeof o.type !== 'string' || !planTypes.includes(o.type as (typeof planTypes)[number])) {
    return { ok: false, message: 'payload.type must be general, study, or work' };
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
