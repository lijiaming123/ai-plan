import { z } from 'zod';

/** 市场列表排序：按点赞数或按发布时间 */
export const marketListSortSchema = z.enum(['likes', 'new']);

export const MARKET_LIST_MAX_PAGE_SIZE = 100;
export const MARKET_LIST_DEFAULT_PAGE_SIZE = 20;

/**
 * GET /templates/market 查询参数（来自 querystring，数值字段用 coerce）。
 */
export const marketListQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
  sort: marketListSortSchema.optional().default('new'),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MARKET_LIST_MAX_PAGE_SIZE)
    .optional()
    .default(MARKET_LIST_DEFAULT_PAGE_SIZE),
});

export type MarketListQuery = z.infer<typeof marketListQuerySchema>;

/** GET /templates/my/market：当前用户与模板的关系分区 */
export const myMarketScopeSchema = z.enum(['created', 'favorited', 'liked']);

/**
 * 我的模板列表（市场模板子集），查询参数与公开市场列表一致并增加 scope。
 */
export const myMarketListQuerySchema = marketListQuerySchema.extend({
  scope: myMarketScopeSchema,
});

export type MyMarketListQuery = z.infer<typeof myMarketListQuerySchema>;

const publishMarketTemplateBaseSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(5000),
  category: z.string().min(1).max(120),
  tags: z.array(z.string().max(64)).max(32).optional().default([]),
  /** 从已有计划导出快照时提供，与 payload 二选一 */
  planId: z.string().min(1).optional(),
  /** 显式 JSON 快照时提供，与 planId 二选一 */
  payload: z.record(z.unknown()).optional(),
});

/**
 * POST /templates/market body。
 * 规则：**必须且仅能**提供 `planId` 或 `payload` 之一（互斥，无优先级合并）。
 */
export const publishMarketTemplateSchema = publishMarketTemplateBaseSchema.superRefine(
  (data, ctx) => {
    const hasPlanId = data.planId !== undefined;
    const hasPayload = data.payload !== undefined;
    if (hasPlanId && hasPayload) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '不能同时提供 planId 与 payload',
        path: ['planId'],
      });
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '不能同时提供 planId 与 payload',
        path: ['payload'],
      });
    }
    if (!hasPlanId && !hasPayload) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '必须提供 planId 或 payload 之一',
      });
    }
  },
);

export type PublishMarketTemplateInput = z.infer<typeof publishMarketTemplateSchema>;
