/**
 * 预设模板（运营配置，存在 PresetTemplate 表）。
 *
 * listPresets：只读列表，可按 category 过滤，不含完整 payload（减小响应）。
 * applyPresetTemplate：读全量行 → parseTemplatePayload → createGeneratedPlan；失败分 404（无此预设）/500（payload 坏）。
 */
import { prisma } from '../../lib/prisma';
import { createGeneratedPlan } from '../plans/plan.service';
import { parseTemplatePayload, templatePayloadToCreateInput } from './template-payload';

/** 与 market 详情一致：需求正文展示上限 */
const PRESET_DETAIL_REQUIREMENT_MAX_CHARS = 120_000;

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

/**
 * 公开详情：与 GET /templates/market/:id 返回结构对齐，便于前端同一详情页渲染。
 * 不含完整 payload JSON，仅解析后的预览字段。
 */
export async function getPresetTemplatePublic(id: string) {
  const preset = await getActivePresetById(id);
  if (!preset) return null;
  const parsed = parseTemplatePayload(preset.payload);
  if (!parsed.ok) return null;
  const requirement = parsed.data.requirement;
  const requirementExcerpt =
    requirement.length > PRESET_DETAIL_REQUIREMENT_MAX_CHARS
      ? requirement.slice(0, PRESET_DETAIL_REQUIREMENT_MAX_CHARS)
      : requirement;
  return {
    id: preset.id,
    authorId: 'system',
    authorName: '系统预设',
    title: preset.title,
    summary: preset.summary,
    category: preset.category,
    tags: preset.tags,
    likeCount: 0,
    applicationCount: 0,
    publishedAt: null,
    preview: {
      goal: parsed.data.goal,
      deadline: parsed.data.deadline,
      requirementExcerpt,
      type: parsed.data.type,
      granularityMode: parsed.data.granularityMode ?? null,
      startDateIso: parsed.data.startDateIso ?? null,
      versionId: `preset:${preset.id}`,
      version: 1,
      payloadHash: 'preset:v1',
    },
  };
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
