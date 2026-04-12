import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
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
});
