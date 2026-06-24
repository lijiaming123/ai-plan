import type { RequestFn } from "../http";
import type {
  MarketListResult,
  MarketTemplateDetail,
  PresetTemplateBrief,
  PublishMarketTemplateInput,
} from "../types/templates.types";

export type TemplatesApi = {
  listPresets(input?: {
    category?: string;
  }): Promise<{ items: PresetTemplateBrief[] }>;
  listMarketTemplates(input: {
    q?: string;
    category?: string;
    tag?: string;
    sort?: "likes" | "new";
    page?: number;
    pageSize?: number;
    /** 传入则列表项含 favorited / likedByMe */
    token?: string;
  }): Promise<MarketListResult>;
  listMyMarketTemplates(input: {
    token: string;
    scope: "created" | "favorited" | "liked";
    q?: string;
    category?: string;
    tag?: string;
    sort?: "likes" | "new";
    page?: number;
    pageSize?: number;
  }): Promise<MarketListResult>;
  publishMarketTemplate(input: PublishMarketTemplateInput): Promise<{
    id: string;
    title: string;
    summary: string;
    category: string;
    tags: string[];
    likeCount: number;
    publishedAt: string | null;
  }>;
  likeMarketTemplate(input: {
    id: string;
    token: string;
  }): Promise<{ liked: boolean; likeCount: number }>;
  unlikeMarketTemplate(input: {
    id: string;
    token: string;
  }): Promise<{ liked: boolean; likeCount: number }>;
  favoriteMarketTemplate(input: {
    id: string;
    token: string;
  }): Promise<{ favorited: boolean }>;
  unfavoriteMarketTemplate(input: {
    id: string;
    token: string;
  }): Promise<{ favorited: boolean }>;
  unpublishMarketTemplate(input: { id: string; token: string }): Promise<{ ok: true }>;
  patchMarketTemplate(input: {
    id: string;
    token: string;
    title?: string;
    summary?: string;
    category?: string;
    tags?: string[];
  }): Promise<{ ok: true }>;
  applyPresetTemplate(input: {
    id: string;
    token: string;
  }): Promise<{ planId: string }>;
  applyMarketTemplate(input: {
    id: string;
    token: string;
  }): Promise<{ planId: string }>;
  getMarketTemplateDetail(input: { id: string; token?: string }): Promise<MarketTemplateDetail>;
  /** GET /templates/presets/:id，返回结构与 MarketTemplateDetail 对齐 */
  getPresetTemplateDetail(input: { id: string; token?: string }): Promise<MarketTemplateDetail>;
};

export function createTemplatesApi(request: RequestFn): TemplatesApi {
  return {
    listPresets(input) {
      const q = input?.category?.trim()
        ? `?category=${encodeURIComponent(input.category.trim())}`
        : "";
      return request<{ items: PresetTemplateBrief[] }>(
        `/templates/presets${q}`,
        {
          method: "GET",
        },
      );
    },
    listMarketTemplates(input) {
      const params = new URLSearchParams();
      if (input.q?.trim()) params.set("q", input.q.trim());
      if (input.category?.trim()) params.set("category", input.category.trim());
      if (input.tag?.trim()) params.set("tag", input.tag.trim());
      if (input.sort) params.set("sort", input.sort);
      if (input.page != null) params.set("page", String(input.page));
      if (input.pageSize != null)
        params.set("pageSize", String(input.pageSize));
      const qs = params.toString();
      const headers: Record<string, string> = {};
      if (input.token) headers.Authorization = `Bearer ${input.token}`;
      return request<MarketListResult>(
        `/templates/market${qs ? `?${qs}` : ""}`,
        {
          method: "GET",
          headers,
        },
      );
    },
    listMyMarketTemplates(input) {
      const params = new URLSearchParams();
      params.set("scope", input.scope);
      if (input.q?.trim()) params.set("q", input.q.trim());
      if (input.category?.trim()) params.set("category", input.category.trim());
      if (input.tag?.trim()) params.set("tag", input.tag.trim());
      if (input.sort) params.set("sort", input.sort);
      if (input.page != null) params.set("page", String(input.page));
      if (input.pageSize != null)
        params.set("pageSize", String(input.pageSize));
      const qs = params.toString();
      return request<MarketListResult>(`/templates/my/market?${qs}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${input.token}` },
      });
    },
    publishMarketTemplate(input) {
      const body: Record<string, unknown> = {
        title: input.title,
        summary: input.summary,
        category: input.category,
        tags: input.tags,
      };
      if (input.planId) body.planId = input.planId;
      if (input.payload) body.payload = input.payload;
      return request(`/templates/market`, {
        method: "POST",
        headers: { Authorization: `Bearer ${input.token}` },
        body: JSON.stringify(body),
      });
    },
    likeMarketTemplate(input) {
      return request<{ liked: boolean; likeCount: number }>(
        `/templates/market/${input.id}/like`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${input.token}` },
        },
      );
    },
    unlikeMarketTemplate(input) {
      return request<{ liked: boolean; likeCount: number }>(
        `/templates/market/${input.id}/like`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${input.token}` },
        },
      );
    },
    favoriteMarketTemplate(input) {
      return request<{ favorited: boolean }>(
        `/templates/market/${input.id}/favorite`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${input.token}` },
        },
      );
    },
    unfavoriteMarketTemplate(input) {
      return request<{ favorited: boolean }>(
        `/templates/market/${input.id}/favorite`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${input.token}` },
        },
      );
    },
    unpublishMarketTemplate(input) {
      return request<{ ok: true }>(`/templates/market/${input.id}/unpublish`, {
        method: "POST",
        headers: { Authorization: `Bearer ${input.token}` },
      });
    },
    patchMarketTemplate(input) {
      return request<{ ok: true }>(`/templates/market/${input.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${input.token}` },
        body: JSON.stringify({
          title: input.title,
          summary: input.summary,
          category: input.category,
          tags: input.tags,
        }),
      });
    },
    applyPresetTemplate(input) {
      return request<{ planId: string }>(
        `/templates/presets/${input.id}/apply`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${input.token}` },
        },
      );
    },
    applyMarketTemplate(input) {
      return request<{ planId: string }>(
        `/templates/market/${input.id}/apply`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${input.token}` },
        },
      );
    },
    getMarketTemplateDetail(input) {
      const headers: Record<string, string> = {};
      if (input.token) headers.Authorization = `Bearer ${input.token}`;
      return request<MarketTemplateDetail>(`/templates/market/${encodeURIComponent(input.id)}`, {
        method: "GET",
        headers,
      });
    },
    getPresetTemplateDetail(input) {
      const headers: Record<string, string> = {};
      if (input.token) headers.Authorization = `Bearer ${input.token}`;
      return request<MarketTemplateDetail>(`/templates/presets/${encodeURIComponent(input.id)}`, {
        method: "GET",
        headers,
      });
    },
  };
}
