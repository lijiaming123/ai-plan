import { z } from 'zod';
/** 市场列表排序：按点赞数或按发布时间 */
export declare const marketListSortSchema: z.ZodEnum<["likes", "new"]>;
export declare const MARKET_LIST_MAX_PAGE_SIZE = 100;
export declare const MARKET_LIST_DEFAULT_PAGE_SIZE = 20;
/**
 * GET /templates/market 查询参数（来自 querystring，数值字段用 coerce）。
 */
export declare const marketListQuerySchema: z.ZodObject<{
    q: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    tag: z.ZodOptional<z.ZodString>;
    sort: z.ZodDefault<z.ZodOptional<z.ZodEnum<["likes", "new"]>>>;
    page: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    pageSize: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    sort: "likes" | "new";
    page: number;
    pageSize: number;
    q?: string | undefined;
    category?: string | undefined;
    tag?: string | undefined;
}, {
    sort?: "likes" | "new" | undefined;
    q?: string | undefined;
    category?: string | undefined;
    tag?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
}>;
export type MarketListQuery = z.infer<typeof marketListQuerySchema>;
/** GET /templates/my/market：当前用户与模板的关系分区 */
export declare const myMarketScopeSchema: z.ZodEnum<["created", "favorited", "liked"]>;
/**
 * 我的模板列表（市场模板子集），查询参数与公开市场列表一致并增加 scope。
 */
export declare const myMarketListQuerySchema: z.ZodObject<{
    q: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    tag: z.ZodOptional<z.ZodString>;
    sort: z.ZodDefault<z.ZodOptional<z.ZodEnum<["likes", "new"]>>>;
    page: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    pageSize: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
} & {
    scope: z.ZodEnum<["created", "favorited", "liked"]>;
}, "strip", z.ZodTypeAny, {
    sort: "likes" | "new";
    page: number;
    pageSize: number;
    scope: "created" | "favorited" | "liked";
    q?: string | undefined;
    category?: string | undefined;
    tag?: string | undefined;
}, {
    scope: "created" | "favorited" | "liked";
    sort?: "likes" | "new" | undefined;
    q?: string | undefined;
    category?: string | undefined;
    tag?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
}>;
export type MyMarketListQuery = z.infer<typeof myMarketListQuerySchema>;
/**
 * POST /templates/market body。
 * 规则：**必须且仅能**提供 `planId` 或 `payload` 之一（互斥，无优先级合并）。
 */
export declare const publishMarketTemplateSchema: z.ZodEffects<z.ZodObject<{
    title: z.ZodString;
    summary: z.ZodString;
    category: z.ZodString;
    tags: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
    /** 从已有计划导出快照时提供，与 payload 二选一 */
    planId: z.ZodOptional<z.ZodString>;
    /** 显式 JSON 快照时提供，与 planId 二选一 */
    payload: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    category: string;
    title: string;
    summary: string;
    tags: string[];
    planId?: string | undefined;
    payload?: Record<string, unknown> | undefined;
}, {
    category: string;
    title: string;
    summary: string;
    tags?: string[] | undefined;
    planId?: string | undefined;
    payload?: Record<string, unknown> | undefined;
}>, {
    category: string;
    title: string;
    summary: string;
    tags: string[];
    planId?: string | undefined;
    payload?: Record<string, unknown> | undefined;
}, {
    category: string;
    title: string;
    summary: string;
    tags?: string[] | undefined;
    planId?: string | undefined;
    payload?: Record<string, unknown> | undefined;
}>;
export type PublishMarketTemplateInput = z.infer<typeof publishMarketTemplateSchema>;
