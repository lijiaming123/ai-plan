import { describe, expect, it } from 'vitest';
import {
  MARKET_LIST_MAX_PAGE_SIZE,
  marketListQuerySchema,
  myMarketListQuerySchema,
  publishMarketTemplateSchema,
} from '@ai-plan/shared';

describe('marketListQuerySchema', () => {
  it('非法 sort 应校验失败', () => {
    const result = marketListQuerySchema.safeParse({
      sort: 'hot',
    });

    expect(result.success).toBe(false);
  });

  it('超过上限的 pageSize 应校验失败', () => {
    const result = marketListQuerySchema.safeParse({
      pageSize: MARKET_LIST_MAX_PAGE_SIZE + 1,
    });

    expect(result.success).toBe(false);
  });

  it('合法参数应通过并带默认值', () => {
    const result = marketListQuerySchema.safeParse({
      q: '考研',
      category: 'study',
      tag: '数学',
      sort: 'likes',
      page: '2',
      pageSize: '10',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort).toBe('likes');
      expect(result.data.page).toBe(2);
      expect(result.data.pageSize).toBe(10);
    }
  });
});

describe('myMarketListQuerySchema', () => {
  it('缺少 scope 应失败', () => {
    const result = myMarketListQuerySchema.safeParse({ sort: 'new' });
    expect(result.success).toBe(false);
  });

  it('合法 scope 应通过', () => {
    const result = myMarketListQuerySchema.safeParse({
      scope: 'favorited',
      page: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scope).toBe('favorited');
    }
  });
});

describe('publishMarketTemplateSchema', () => {
  const validBase = {
    title: '我的模板',
    summary: '适用于短期冲刺',
    category: 'study',
    tags: ['考试'],
  };

  it('仅 planId 时应通过', () => {
    const result = publishMarketTemplateSchema.safeParse({
      ...validBase,
      planId: 'clxxxxxxxx',
    });
    expect(result.success).toBe(true);
  });

  it('仅 payload 时应通过', () => {
    const result = publishMarketTemplateSchema.safeParse({
      ...validBase,
      payload: { goal: '目标', foo: 1 },
    });
    expect(result.success).toBe(true);
  });

  it('同时提供 planId 与 payload 应失败', () => {
    const result = publishMarketTemplateSchema.safeParse({
      ...validBase,
      planId: 'clxxxxxxxx',
      payload: { a: 1 },
    });
    expect(result.success).toBe(false);
  });

  it('两者皆不提供应失败', () => {
    const result = publishMarketTemplateSchema.safeParse({
      ...validBase,
    });
    expect(result.success).toBe(false);
  });
});
