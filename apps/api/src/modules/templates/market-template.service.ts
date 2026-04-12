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

const AUTHOR_LABELS: Record<string, string> = {
  user_demo: '演示用户',
  admin_demo: '管理员',
};

function authorLabel(authorId: string) {
  return AUTHOR_LABELS[authorId] ?? '用户';
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

  const where: Prisma.MarketTemplateWhereInput = {
    AND: [publishedMarketBase({ q, category, tag }), scopeWhere],
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
      payload: true,
    },
  });
  if (!row) return null;
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

export async function publishMarketTemplate(rawBody: unknown, userId: string) {
  const parsed = publishMarketTemplateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { ok: false as const, code: 400 as const, message: parsed.error.message };
  }
  const body = parsed.data;

  let payload: unknown;
  let sourcePlanId: string | null = null;

  if (body.planId) {
    const plan = await prisma.plan.findFirst({
      where: { id: body.planId, userId },
    });
    if (!plan) {
      return { ok: false as const, code: 404 as const, message: 'plan not found' };
    }
    sourcePlanId = plan.id;
    payload = planToPayload(plan);
  } else {
    payload = body.payload;
  }

  const payloadCheck = parseTemplatePayload(payload);
  if (!payloadCheck.ok) {
    return { ok: false as const, code: 400 as const, message: payloadCheck.message };
  }

  const now = new Date();
  const created = await prisma.marketTemplate.create({
    data: {
      authorId: userId,
      sourcePlanId,
      title: body.title,
      summary: body.summary,
      category: body.category,
      tags: body.tags,
      payload: payload as InputJsonValue,
      status: 'published',
      publishedAt: now,
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
  const parsed = parseTemplatePayload(row.payload);
  if (!parsed.ok) {
    return { ok: false as const, code: 500 as const, message: parsed.message };
  }

  const plan = await createGeneratedPlan(templatePayloadToCreateInput(parsed.data, userId));
  await prisma.marketTemplate.update({
    where: { id: templateId },
    data: { applicationCount: { increment: 1 } },
  });

  return { ok: true as const, planId: plan.id };
}
