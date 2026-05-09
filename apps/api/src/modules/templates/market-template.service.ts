/**
 * 市场模板（用户 UGC，MarketTemplate 及相关点赞/收藏表）。
 *
 * 列表查询参数由 packages/shared 中 Zod schema 解析；Prisma where 在 publishedMarketBase 等函数拼装。
 * authorLabel 为演示环境写死映射，生产可换查用户表昵称。
 * apply 与 preset 类似：校验 payload 后 createGeneratedPlan。
 */
import type { Prisma } from '@prisma/client';
import type { InputJsonValue } from '@prisma/client/runtime/library';
import {
  marketListQuerySchema,
  myMarketListQuerySchema,
  publishMarketTemplateSchema,
} from '../../../../../packages/shared/src/template-schemas.js';
import { prisma } from '../../lib/prisma';
import { createGeneratedPlan } from '../plans/plan.service';
import { parseTemplatePayload, templatePayloadToCreateInput } from './template-payload';
import { hitSimpleRateLimit } from '../../lib/simple-rate-limit';

const AUTHOR_LABELS: Record<string, string> = {
  user_demo: '演示用户',
  admin_demo: '管理员',
};

function authorLabel(authorId: string) {
  return AUTHOR_LABELS[authorId] ?? '用户';
}

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const normalize = (v: unknown): unknown => {
    if (v === null) return null;
    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') return v;
    if (Array.isArray(v)) return v.map(normalize);
    if (t === 'object') {
      const obj = v as Record<string, unknown>;
      if (seen.has(obj)) return '[Circular]';
      seen.add(obj);
      const keys = Object.keys(obj).sort();
      const out: Record<string, unknown> = {};
      for (const k of keys) out[k] = normalize(obj[k]);
      return out;
    }
    return String(v);
  };
  return JSON.stringify(normalize(value));
}

function payloadHash(payload: unknown): string {
  // 轻量哈希：用于去重与审计；不要求密码学强度
  let h = 2166136261;
  const s = stableStringify(payload);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`;
}

async function ensureCurrentPublishedVersion(templateId: string) {
  return prisma.$transaction(async (tx) => {
    const tpl = await tx.marketTemplate.findUnique({
      where: { id: templateId },
      select: {
        id: true,
        payload: true,
        currentPublishedVersionId: true,
      },
    });
    if (!tpl) return null;

    if (tpl.currentPublishedVersionId) {
      const existing = await tx.marketTemplateVersion.findUnique({
        where: { id: tpl.currentPublishedVersionId },
      });
      if (existing) return existing;
    }

    // 历史 published 模板可能没有版本：懒补一个版本并回填 currentPublishedVersionId
    const count = await tx.marketTemplateVersion.count({ where: { templateId } });
    const created = await tx.marketTemplateVersion.create({
      data: {
        templateId,
        version: count + 1,
        payload: tpl.payload,
        payloadHash: payloadHash(tpl.payload),
      },
    });
    await tx.marketTemplate.update({
      where: { id: templateId },
      data: { currentPublishedVersionId: created.id },
      select: { id: true },
    });
    return created;
  });
}

type MarketTextFilter = {
  q?: string;
  category?: string;
  tag?: string;
};

function publishedMarketBase(f: MarketTextFilter): Prisma.MarketTemplateWhereInput {
  return {
    status: 'published',
    ...(f.category ? { category: f.category } : {}),
    ...(f.tag ? { tags: { has: f.tag } } : {}),
    ...(f.q
      ? {
          OR: [
            { title: { contains: f.q, mode: 'insensitive' } },
            { summary: { contains: f.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

export function parseMarketListQuery(raw: Record<string, unknown>) {
  return marketListQuerySchema.safeParse(raw);
}

export function parseMyMarketListQuery(raw: Record<string, unknown>) {
  return myMarketListQuerySchema.safeParse(raw);
}

const marketSelect = {
  id: true,
  authorId: true,
  title: true,
  summary: true,
  category: true,
  tags: true,
  likeCount: true,
  applicationCount: true,
  publishedAt: true,
  status: true,
  rejectedAt: true,
  rejectReasonCode: true,
  rejectNote: true,
} as const;

async function enrichWithViewerFlags(
  viewerUserId: string | undefined,
  items: Array<{ id: string }>,
): Promise<{ favorited: Set<string>; liked: Set<string> }> {
  if (!viewerUserId || items.length === 0) {
    return { favorited: new Set(), liked: new Set() };
  }
  const ids = items.map((i) => i.id);
  const [favRows, likeRows] = await Promise.all([
    prisma.marketTemplateFavorite.findMany({
      where: { userId: viewerUserId, templateId: { in: ids } },
      select: { templateId: true },
    }),
    prisma.marketTemplateLike.findMany({
      where: { userId: viewerUserId, templateId: { in: ids } },
      select: { templateId: true },
    }),
  ]);
  return {
    favorited: new Set(favRows.map((r) => r.templateId)),
    liked: new Set(likeRows.map((r) => r.templateId)),
  };
}

function mapMarketRows(
  rows: Array<{
    id: string;
    authorId: string;
    title: string;
    summary: string;
    category: string;
    tags: string[];
    likeCount: number;
    applicationCount: number;
    publishedAt: Date | null;
    status: string;
    rejectedAt?: Date | null;
    rejectReasonCode?: string | null;
    rejectNote?: string | null;
  }>,
  flags: { favorited: Set<string>; liked: Set<string> },
  withFlags: boolean,
) {
  return rows.map((row) => ({
    id: row.id,
    authorId: row.authorId,
    authorName: authorLabel(row.authorId),
    title: row.title,
    summary: row.summary,
    category: row.category,
    tags: row.tags,
    likeCount: row.likeCount,
    applicationCount: row.applicationCount,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    status: row.status,
    rejectedAt: row.rejectedAt ? row.rejectedAt.toISOString() : null,
    rejectReasonCode: row.rejectReasonCode ?? null,
    rejectNote: row.rejectNote ?? null,
    ...(withFlags
      ? {
          favorited: flags.favorited.has(row.id),
          likedByMe: flags.liked.has(row.id),
        }
      : {}),
  }));
}

export async function listMarketTemplates(
  query: Record<string, unknown>,
  options?: { viewerUserId?: string },
) {
  const parsed = parseMarketListQuery(query);
  if (!parsed.success) {
    return { ok: false as const, message: parsed.error.message };
  }
  const { q, category, tag, sort, page, pageSize } = parsed.data;
  const where = publishedMarketBase({ q, category, tag });

  const orderBy: Prisma.MarketTemplateOrderByWithRelationInput[] =
    sort === 'likes'
      ? [{ likeCount: 'desc' }, { id: 'desc' }]
      : [{ publishedAt: 'desc' }, { id: 'desc' }];

  const [items, total] = await Promise.all([
    prisma.marketTemplate.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: marketSelect,
    }),
    prisma.marketTemplate.count({ where }),
  ]);

  const flags = await enrichWithViewerFlags(options?.viewerUserId, items);
  const withFlags = Boolean(options?.viewerUserId);

  return {
    ok: true as const,
    data: {
      items: mapMarketRows(items, flags, withFlags),
      page,
      pageSize,
      total,
    },
  };
}

export async function listMyMarketTemplates(userId: string, query: Record<string, unknown>) {
  const parsed = parseMyMarketListQuery(query);
  if (!parsed.success) {
    return { ok: false as const, message: parsed.error.message };
  }
  const { scope, q, category, tag, sort, page, pageSize } = parsed.data;

  const scopeWhere: Prisma.MarketTemplateWhereInput =
    scope === 'created'
      ? { authorId: userId }
      : scope === 'favorited'
        ? { favorites: { some: { userId } } }
        : { likes: { some: { userId } } };

  const baseWhere =
    scope === 'created'
      ? {
          ...(q
            ? {
                OR: [
                  { title: { contains: q, mode: 'insensitive' } },
                  { summary: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {}),
          ...(category ? { category } : {}),
          ...(tag ? { tags: { has: tag } } : {}),
        }
      : publishedMarketBase({ q, category, tag });

  const where: Prisma.MarketTemplateWhereInput = {
    AND: [baseWhere, scopeWhere],
  };

  const orderBy: Prisma.MarketTemplateOrderByWithRelationInput[] =
    sort === 'likes'
      ? [{ likeCount: 'desc' }, { id: 'desc' }]
      : [{ publishedAt: 'desc' }, { id: 'desc' }];

  const [items, total] = await Promise.all([
    prisma.marketTemplate.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: marketSelect,
    }),
    prisma.marketTemplate.count({ where }),
  ]);

  const flags = await enrichWithViewerFlags(userId, items);

  return {
    ok: true as const,
    data: {
      items: mapMarketRows(items, flags, true),
      page,
      pageSize,
      total,
    },
  };
}

export async function getMarketTemplatePublic(id: string) {
  const row = await prisma.marketTemplate.findFirst({
    where: { id, status: 'published' },
    select: {
      id: true,
      authorId: true,
      title: true,
      summary: true,
      category: true,
      tags: true,
      likeCount: true,
      applicationCount: true,
      publishedAt: true,
      currentPublishedVersionId: true,
    },
  });
  if (!row) return null;
  const version = await ensureCurrentPublishedVersion(row.id);
  if (!version) return null;
  const parsed = parseTemplatePayload(version.payload);
  if (!parsed.ok) {
    // 历史数据异常：公开详情按 500 处理（调用方可转为 message）
    throw new Error(parsed.message);
  }
  const preview = {
    goal: parsed.data.goal,
    deadline: parsed.data.deadline,
    requirementExcerpt: parsed.data.requirement.slice(0, 160),
    type: parsed.data.type,
    granularityMode: parsed.data.granularityMode ?? null,
    startDateIso: parsed.data.startDateIso ?? null,
    versionId: version.id,
    version: version.version,
    payloadHash: version.payloadHash,
  };
  return {
    id: row.id,
    authorId: row.authorId,
    authorName: authorLabel(row.authorId),
    title: row.title,
    summary: row.summary,
    category: row.category,
    tags: row.tags,
    likeCount: row.likeCount,
    applicationCount: row.applicationCount,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    preview,
  };
}

function planToPayload(plan: {
  goal: string;
  deadline: Date;
  requirement: string;
  type: string;
}) {
  return {
    goal: plan.goal,
    deadline: plan.deadline.toISOString(),
    requirement: plan.requirement,
    type: plan.type,
  };
}

/**
 * v1 风控：短时间内连续发布过多模板则转入人工审核。
 *
 * 规则（固定阈值，后续可抽配置）：
 * - 统计最近 60 秒内同一 authorId 发布的模板数量（含已发布/待审等）
 * - 若已达到 2，则本次创建为 pending_review（第 3 次触发）
 */
async function shouldSendToReview(authorId: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - 60_000);
  const count = await prisma.marketTemplate.count({
    where: {
      authorId,
      createdAt: { gte: since },
    },
  });
  return count >= 2;
}

export async function publishMarketTemplate(rawBody: unknown, userId: string) {
  // 兼容：某些代理/客户端可能把 JSON body 作为 string 传入
  //（例如缺失/被覆盖 Content-Type 时 Fastify 可能不做 JSON 解析）
  let normalizedBody: unknown = rawBody;
  if (typeof rawBody === 'string') {
    try {
      normalizedBody = JSON.parse(rawBody);
    } catch {
      normalizedBody = rawBody;
    }
  }

  const parsed = publishMarketTemplateSchema.safeParse(normalizedBody);
  if (!parsed.success) {
    const first = parsed.error.issues?.[0];
    const msg = first?.message ? `请求参数有误：${first.message}` : '请求参数有误';
    return { ok: false as const, code: 400 as const, message: msg };
  }
  const body = parsed.data;

  let payload: unknown;
  let sourcePlanId: string | null = null;

  if (body.planId) {
    const plan =
      (await prisma.plan.findFirst({
        where: { id: body.planId, userId },
      })) ??
      (await prisma.planGenerationDraft.findFirst({
        where: { id: body.planId, userId },
      }));
    if (!plan) {
      return { ok: false as const, code: 404 as const, message: 'plan not found' };
    }
    sourcePlanId = body.planId;
    payload = planToPayload(plan);
  } else {
    payload = body.payload;
  }

  const payloadCheck = parseTemplatePayload(payload);
  if (!payloadCheck.ok) {
    return { ok: false as const, code: 400 as const, message: payloadCheck.message };
  }

  // Story 018 (v1): 发布基础频控（每用户每分钟最多 5 次）
  const publishLimit = hitSimpleRateLimit({
    keyParts: ['templates:publish', userId],
    windowMs: 60_000,
    max: 5,
  });
  if (!publishLimit.allowed) {
    return { ok: false as const, code: 429 as const, message: '请求过于频繁，请稍后再试' };
  }

  const now = new Date();
  const pendingReview = await shouldSendToReview(userId, now);
  const status = pendingReview ? 'pending_review' : 'published';
  const created = await prisma.marketTemplate.create({
    data: {
      authorId: userId,
      sourcePlanId,
      title: body.title,
      summary: body.summary,
      category: body.category,
      tags: body.tags,
      payload: payload as InputJsonValue,
      status,
      publishedAt: status === 'published' ? now : null,
    },
    select: {
      id: true,
      title: true,
      summary: true,
      category: true,
      tags: true,
      likeCount: true,
      publishedAt: true,
    },
  });

  return {
    ok: true as const,
    template: {
      ...created,
      publishedAt: created.publishedAt?.toISOString() ?? null,
    },
  };
}

export async function likeMarketTemplate(templateId: string, userId: string) {
  const template = await prisma.marketTemplate.findFirst({
    where: { id: templateId, status: 'published' },
  });
  if (!template) {
    return { ok: false as const, code: 404 as const, message: 'template not found' };
  }

  const existing = await prisma.marketTemplateLike.findUnique({
    where: { userId_templateId: { userId, templateId } },
  });
  if (existing) {
    return { ok: true as const, liked: true, likeCount: template.likeCount };
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.marketTemplateLike.create({
      data: { userId, templateId },
    });
    return tx.marketTemplate.update({
      where: { id: templateId },
      data: { likeCount: { increment: 1 } },
      select: { likeCount: true },
    });
  });

  return { ok: true as const, liked: true, likeCount: updated.likeCount };
}

export async function unlikeMarketTemplate(templateId: string, userId: string) {
  const template = await prisma.marketTemplate.findFirst({
    where: { id: templateId, status: 'published' },
  });
  if (!template) {
    return { ok: false as const, code: 404 as const, message: 'template not found' };
  }

  const existing = await prisma.marketTemplateLike.findUnique({
    where: { userId_templateId: { userId, templateId } },
  });
  if (!existing) {
    return { ok: true as const, liked: false, likeCount: template.likeCount };
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.marketTemplateLike.delete({
      where: { userId_templateId: { userId, templateId } },
    });
    const next = Math.max(0, template.likeCount - 1);
    return tx.marketTemplate.update({
      where: { id: templateId },
      data: { likeCount: next },
      select: { likeCount: true },
    });
  });

  return { ok: true as const, liked: false, likeCount: updated.likeCount };
}

export async function favoriteMarketTemplate(templateId: string, userId: string) {
  const template = await prisma.marketTemplate.findFirst({
    where: { id: templateId, status: 'published' },
  });
  if (!template) {
    return { ok: false as const, code: 404 as const, message: 'template not found' };
  }

  const existing = await prisma.marketTemplateFavorite.findUnique({
    where: { userId_templateId: { userId, templateId } },
  });
  if (existing) {
    return { ok: true as const, favorited: true };
  }

  await prisma.marketTemplateFavorite.create({
    data: { userId, templateId },
  });
  return { ok: true as const, favorited: true };
}

export async function unfavoriteMarketTemplate(templateId: string, userId: string) {
  const template = await prisma.marketTemplate.findFirst({
    where: { id: templateId, status: 'published' },
  });
  if (!template) {
    return { ok: false as const, code: 404 as const, message: 'template not found' };
  }

  try {
    await prisma.marketTemplateFavorite.delete({
      where: { userId_templateId: { userId, templateId } },
    });
  } catch {
    /* not favorited */
  }
  return { ok: true as const, favorited: false };
}

export async function applyMarketTemplate(templateId: string, userId: string) {
  const row = await prisma.marketTemplate.findFirst({
    where: { id: templateId, status: 'published' },
  });
  if (!row) {
    return { ok: false as const, code: 404 as const, message: 'template not found' };
  }
  const version = await ensureCurrentPublishedVersion(templateId);
  if (!version) {
    return { ok: false as const, code: 404 as const, message: 'template not found' };
  }
  const parsed = parseTemplatePayload(version.payload);
  if (!parsed.ok) {
    return { ok: false as const, code: 500 as const, message: parsed.message };
  }

  const plan = await createGeneratedPlan(templatePayloadToCreateInput(parsed.data, userId));
  await prisma.$transaction(async (tx) => {
    await tx.marketTemplate.update({
      where: { id: templateId },
      data: { applicationCount: { increment: 1 } },
    });
    await tx.templateApplication.create({
      data: {
        userId,
        templateId,
        versionId: version.id,
        planId: plan.id,
      },
      select: { id: true },
    });
  });

  return { ok: true as const, planId: plan.id };
}
