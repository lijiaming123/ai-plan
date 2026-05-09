import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
const { trackEventMock, trackPageViewMock } = vi.hoisted(() => ({
  trackEventMock: vi.fn(),
  trackPageViewMock: vi.fn(),
}));

vi.mock('../src/lib/telemetry', () => ({
  trackEvent: trackEventMock,
  trackPageView: trackPageViewMock,
}));

import { createAppRouter } from '../src/router';
import TemplatesPage from '../src/features/templates/TemplatesPage.vue';
import TemplateMarketList from '../src/features/templates/TemplateMarketList.vue';
import { createApiClient, setApiClient } from '../src/lib/api-client';
import { clearAuthToken, setAuthToken } from '../src/stores/auth';

function demoJwt() {
  const payload = Buffer.from(JSON.stringify({ sub: 'user_demo', role: 'user' })).toString('base64');
  return `h.${payload}.s`;
}

describe('TemplatesPage / TemplateMarketList', () => {
  it('应加载预设与市场列表并支持排序切换', async () => {
    trackEventMock.mockReset();
    trackPageViewMock.mockReset();
    clearAuthToken();
    const listPresets = vi.fn().mockResolvedValue({
      items: [
        {
          id: 'p1',
          slug: 's1',
          title: '预设 A',
          summary: '摘要',
          coverImageUrl: null,
          category: 'study',
          tags: [],
          locale: 'zh-CN',
          sortOrder: 0,
        },
      ],
    });
    const listMarket = vi.fn().mockResolvedValue({
      items: [
        {
          id: 'm1',
          authorId: 'u1',
          authorName: '作者',
          title: '市场 A',
          summary: '描述',
          category: 'work',
          tags: [],
          likeCount: 3,
          applicationCount: 0,
          publishedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    });

    const noopFetch = vi.fn(() => Promise.reject(new Error('unexpected fetch'))) as unknown as typeof fetch;
    const base = createApiClient({ baseURL: 'http://test.local', fetchImpl: noopFetch });
    const listMy = vi.fn().mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });

    setApiClient({
      ...base,
      listPresets,
      listMarketTemplates: listMarket,
      listMyMarketTemplates: listMy,
    });

    const router = createAppRouter(createMemoryHistory());
    await router.push('/templates');
    await router.isReady();

    const wrapper = mount(TemplatesPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(listPresets).toHaveBeenCalled();
    expect(listMarket).toHaveBeenCalled();
    const firstCallArg = listMarket.mock.calls[0]![0] as { sort?: string };
    expect(firstCallArg.sort).toBe('new');

    await wrapper.get('[data-testid="sort-likes"]').trigger('click');
    await nextTick();
    await flushPromises();

    expect(
      listMarket.mock.calls.some((c) => (c[0] as { sort?: string }).sort === 'likes'),
    ).toBe(true);

    clearAuthToken();
    setAuthToken(demoJwt());
    const wrapper2 = mount(TemplatesPage, { global: { plugins: [router] } });
    await flushPromises();
    await wrapper2.get('[data-testid="tab-mine"]').trigger('click');
    await nextTick();
    await flushPromises();
    expect(listMy).toHaveBeenCalled();
    clearAuthToken();
  });

  it('套用市场模板后应发送 template_use 埋点', async () => {
    trackEventMock.mockReset();
    trackPageViewMock.mockReset();
    clearAuthToken();
    setAuthToken(demoJwt());

    const listPresets = vi.fn().mockResolvedValue({ items: [] });
    const listMarket = vi.fn().mockResolvedValue({
      items: [
        {
          id: 'm1',
          authorId: 'u1',
          authorName: '作者',
          title: '市场 A',
          summary: '描述',
          category: 'work',
          tags: [],
          likeCount: 3,
          applicationCount: 0,
          publishedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    const applyMarketTemplate = vi.fn().mockResolvedValue({ planId: 'plan_from_market' });
    setApiClient({
      ...createApiClient(),
      listPresets,
      listMarketTemplates: listMarket,
      listMyMarketTemplates: vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 }),
      applyMarketTemplate,
    });

    const router = createAppRouter(createMemoryHistory());
    const push = vi.spyOn(router, 'push');
    await router.push('/templates');
    await router.isReady();

    const wrapper = mount(TemplatesPage, { global: { plugins: [router] } });
    await flushPromises();

    await wrapper.get('[data-testid="btn-apply"]').trigger('click');
    await flushPromises();

    expect(applyMarketTemplate).toHaveBeenCalledWith({ id: 'm1', token: demoJwt() });
    expect(trackEventMock).toHaveBeenCalledWith('template_use', {
      properties: {
        templateId: 'm1',
        templateSource: 'market',
        planId: 'plan_from_market',
      },
    });
    expect(push).toHaveBeenCalledWith('/plans/plan_from_market');
    clearAuthToken();
  });

  it('TemplateMarketList 在登录态应显示套用而非登录引导', () => {
    const wrapper = mount(TemplateMarketList, {
      props: {
        items: [
          {
            id: 'm1',
            authorId: 'u1',
            authorName: '作者',
            title: 'T',
            summary: 'S',
            category: 'c',
            tags: [],
            likeCount: 0,
            applicationCount: 0,
            publishedAt: null,
          },
        ],
        loading: false,
        sort: 'new',
        loggedIn: true,
      },
    });
    expect(wrapper.get('[data-testid="btn-apply"]').text()).toContain('套用');
  });

  it('我的模板（我创建的）应展示状态，并在驳回/下架时提供重新提交入口', async () => {
    trackEventMock.mockReset();
    trackPageViewMock.mockReset();
    clearAuthToken();
    setAuthToken(demoJwt());

    const noopFetch = vi.fn(() => Promise.reject(new Error('unexpected fetch'))) as unknown as typeof fetch;
    const base = createApiClient({ baseURL: 'http://test.local', fetchImpl: noopFetch });
    const listMy = vi.fn().mockResolvedValue({
      items: [
        {
          id: 'm1',
          authorId: 'user_demo',
          authorName: '我',
          title: '待审模板',
          summary: '摘要',
          category: 'work',
          tags: [],
          likeCount: 0,
          applicationCount: 0,
          publishedAt: null,
          status: 'pending_review',
        },
        {
          id: 'm2',
          authorId: 'user_demo',
          authorName: '我',
          title: '被驳回模板',
          summary: '摘要',
          category: 'work',
          tags: [],
          likeCount: 0,
          applicationCount: 0,
          publishedAt: null,
          status: 'rejected',
          rejectReasonCode: 'spam',
          rejectNote: '包含推广内容',
        },
        {
          id: 'm3',
          authorId: 'user_demo',
          authorName: '我',
          title: '已下架模板',
          summary: '摘要',
          category: 'work',
          tags: [],
          likeCount: 0,
          applicationCount: 0,
          publishedAt: null,
          status: 'unpublished',
        },
      ],
      page: 1,
      pageSize: 20,
      total: 3,
    });

    setApiClient({
      ...base,
      listPresets: vi.fn().mockResolvedValue({ items: [] }),
      listMarketTemplates: vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 }),
      listMyMarketTemplates: listMy,
      patchMarketTemplate: vi.fn().mockResolvedValue({ ok: true }),
      unpublishMarketTemplate: vi.fn().mockResolvedValue({ ok: true }),
      applyMarketTemplate: vi.fn().mockResolvedValue({ planId: 'p1' }),
      likeMarketTemplate: vi.fn().mockResolvedValue({ liked: true, likeCount: 1 }),
      unlikeMarketTemplate: vi.fn().mockResolvedValue({ liked: false, likeCount: 0 }),
      favoriteMarketTemplate: vi.fn().mockResolvedValue({ favorited: true }),
      unfavoriteMarketTemplate: vi.fn().mockResolvedValue({ favorited: false }),
    });

    const router = createAppRouter(createMemoryHistory());
    await router.push('/templates');
    await router.isReady();
    const wrapper = mount(TemplatesPage, { global: { plugins: [router] } });
    await flushPromises();

    await wrapper.get('[data-testid="tab-mine"]').trigger('click');
    await nextTick();
    await flushPromises();

    // 默认 scope=created：状态应进行中文映射展示
    const statuses = wrapper.findAll('[data-testid="template-status"]').map((x) => x.text());
    expect(statuses.some((t) => t.includes('待审核'))).toBe(true);
    expect(statuses.some((t) => t.includes('已驳回'))).toBe(true);
    expect(statuses.some((t) => t.includes('已下架'))).toBe(true);

    // 驳回原因应有可见提示
    expect(wrapper.find('[data-testid="template-reject-reason"]').exists()).toBe(true);

    // 驳回/下架应提供重新提交入口
    const resubmits = wrapper.findAll('[data-testid="btn-resubmit"]');
    expect(resubmits.length).toBeGreaterThanOrEqual(2);
    clearAuthToken();
  });
});
