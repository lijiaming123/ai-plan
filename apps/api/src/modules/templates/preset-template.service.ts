/**
 * 预设模板（运营配置，存在 PresetTemplate 表）。
 *
 * listPresets：只读列表，可按 category 过滤，不含完整 payload（减小响应）。
 * applyPresetTemplate：读全量行 → parseTemplatePayload → createGeneratedPlan；失败分 404（无此预设）/500（payload 坏）。
 */
import { prisma } from '../../lib/prisma';
import { createGeneratedPlan } from '../plans/plan.service';
import { parseTemplatePayload, templatePayloadToCreateInput } from './template-payload';

export async function listPresets(category?: string) {
  return prisma.presetTemplate.findMany({
    where: {
      isActive: true,
      ...(category ? { category } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      coverImageUrl: true,
      category: true,
      tags: true,
      locale: true,
      sortOrder: true,
    },
  });
}

export async function getActivePresetById(id: string) {
  return prisma.presetTemplate.findFirst({
    where: { id, isActive: true },
  });
}

export async function applyPresetTemplate(presetId: string, userId: string) {
  const preset = await getActivePresetById(presetId);
  if (!preset) {
    return { ok: false as const, code: 404 as const, message: 'preset not found' };
  }
  const parsed = parseTemplatePayload(preset.payload);
  if (!parsed.ok) {
    return { ok: false as const, code: 500 as const, message: parsed.message };
  }
  const plan = await createGeneratedPlan(templatePayloadToCreateInput(parsed.data, userId));
  return { ok: true as const, planId: plan.id };
}
