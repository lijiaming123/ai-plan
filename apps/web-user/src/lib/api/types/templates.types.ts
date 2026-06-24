export type PresetTemplateBrief = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  coverImageUrl: string | null;
  category: string;
  tags: string[];
  locale: string;
  sortOrder: number;
};

export type MarketTemplateBrief = {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  likeCount: number;
  applicationCount: number;
  publishedAt: string | null;
  /** 作者侧管理与审核状态（created scope 可能返回；市场列表通常为 published） */
  status?: string;
  rejectedAt?: string | null;
  rejectReasonCode?: string | null;
  rejectNote?: string | null;
  /** 登录访问市场列表时由后端返回 */
  favorited?: boolean;
  likedByMe?: boolean;
};

export type MarketTemplatePreview = {
  goal: string;
  deadline: string;
  requirementExcerpt: string;
  type: string;
  granularityMode: string | null;
  startDateIso: string | null;
  versionId: string;
  version: number;
  payloadHash: string;
};

export type MarketTemplateDetail = MarketTemplateBrief & {
  preview: MarketTemplatePreview;
};

export type MarketListResult = {
  items: MarketTemplateBrief[];
  page: number;
  pageSize: number;
  total: number;
};

export type PublishMarketTemplateInput = {
  token: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  planId?: string;
  payload?: Record<string, unknown>;
};
