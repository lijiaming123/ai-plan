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
import TemplateMarketDetailPage from '../src/features/templates/TemplateMarketDetailPage.vue';
import { setApiClient, createApiClient } from '../src/lib/api-client';
import { clearAuthToken, setAuthToken } from '../src/stores/auth';

function demoJwt() {
  const payload = Buffer.from(JSON.stringify({ sub: 'user_demo', role: 'user' })).toString('base64');
  return `h.${payload}.s`;
}

describe('TemplateMarketDetailPage', () => {
  it('应加载详情并渲染预览字段', async () => {
    trackEventMock.mockReset();
    trackPageViewMock.mockReset();
    clearAuthToken();

    const noopFetch = vi.fn(() => Promise.reject(new Error('unexpected fetch'))) as unknown as typeof fetch;
    const base = createApiClient({ baseURL: 'http://test.local', fetchImpl: noopFetch });
    const getMarketTemplateDetail = vi.fn().mockResolvedValue({
      id: 'm1',
      authorId: 'u1',
      authorName: '作者',
      title: '市场 A',
      summary: '描述',
      category: 'work',
      tags: [],
      likeCount: 3,
      applicationCount: 2,
      publishedAt: '2026-01-01T00:00:00.000Z',
      preview: {
        goal: 'Beta 目标',
        deadline: '2026-11-01T00:00:00.000Z',
        requirementExcerpt: 'Beta 需求内容用于测试',
        type: 'study',
        granularityMode: null,
        startDateIso: null,
        versionId: 'v1',
        version: 1,
        payloadHash: 'fnv1a32:00000000',
      },
    });

    setApiClient({
      ...base,
      getMarketTemplateDetail,
      applyMarketTemplate: vi.fn().mockResolvedValue({ planId: 'p1' }),
    });

    const router = createAppRouter(createMemoryHistory());
    await router.push('/templates/market/m1');
    await router.isReady();

    const wrapper = mount(TemplateMarketDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(getMarketTemplateDetail).toHaveBeenCalledWith({ id: 'm1', token: undefined });
    expect(wrapper.get('[data-testid="detail-title"]').text()).toContain('市场 A');
    expect(wrapper.get('[data-testid="preview-goal"]').text()).toContain('Beta');
    expect(wrapper.get('[data-testid="preview-type"]').text()).toBe('study');
    // 未登录不应打点
    expect(trackEventMock).not.toHaveBeenCalledWith('template_detail_open', expect.anything());
    clearAuthToken();
  });

  it('点击套用应调用 apply 并跳转，且发送埋点', async () => {
    trackEventMock.mockReset();
    trackPageViewMock.mockReset();
    clearAuthToken();
    setAuthToken(demoJwt());

    const applyMarketTemplate = vi.fn().mockResolvedValue({ planId: 'plan_from_market' });
    const getMarketTemplateDetail = vi.fn().mockResolvedValue({
      id: 'm1',
      authorId: 'u1',
      authorName: '作者',
      title: '市场 A',
      summary: '描述',
      category: 'work',
      tags: [],
      likeCount: 3,
      applicationCount: 2,
      publishedAt: '2026-01-01T00:00:00.000Z',
      preview: {
        goal: 'G',
        deadline: '2026-11-01T00:00:00.000Z',
        requirementExcerpt: 'R',
        type: 'work',
        granularityMode: 'smart',
        startDateIso: null,
        versionId: 'v1',
        version: 1,
        payloadHash: 'fnv1a32:00000000',
      },
    });

    setApiClient({
      ...createApiClient(),
      getMarketTemplateDetail,
      applyMarketTemplate,
    });

    const router = createAppRouter(createMemoryHistory());
    const push = vi.spyOn(router, 'push');
    await router.push('/templates/market/m1');
    await router.isReady();

    const wrapper = mount(TemplateMarketDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    await wrapper.get('[data-testid="detail-apply"]').trigger('click');
    await flushPromises();

    expect(applyMarketTemplate).toHaveBeenCalledWith({ id: 'm1', token: demoJwt() });
    expect(trackEventMock).toHaveBeenCalledWith('template_use', {
      properties: {
        templateId: 'm1',
        templateSource: 'market',
        planId: 'plan_from_market',
        versionId: 'v1',
      },
    });
    expect(push).toHaveBeenCalledWith('/plans/plan_from_market');
    clearAuthToken();
  });

  it('登录态打开详情应发送 template_detail_open（含 templateId/versionId）', async () => {
    trackEventMock.mockReset();
    trackPageViewMock.mockReset();
    clearAuthToken();
    setAuthToken(demoJwt());

    const getMarketTemplateDetail = vi.fn().mockResolvedValue({
      id: 'm1',
      authorId: 'u1',
      authorName: '作者',
      title: '市场 A',
      summary: '描述',
      category: 'work',
      tags: [],
      likeCount: 3,
      applicationCount: 2,
      publishedAt: '2026-01-01T00:00:00.000Z',
      preview: {
        goal: 'G',
        deadline: '2026-11-01T00:00:00.000Z',
        requirementExcerpt: 'R',
        type: 'work',
        granularityMode: 'smart',
        startDateIso: null,
        versionId: 'v1',
        version: 1,
        payloadHash: 'fnv1a32:00000000',
      },
    });

    setApiClient({
      ...createApiClient(),
      getMarketTemplateDetail,
      applyMarketTemplate: vi.fn().mockResolvedValue({ planId: 'p1' }),
    });

    const router = createAppRouter(createMemoryHistory());
    await router.push('/templates/market/m1');
    await router.isReady();

    mount(TemplateMarketDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(trackEventMock).toHaveBeenCalledWith('template_detail_open', {
      properties: {
        templateId: 'm1',
        versionId: 'v1',
      },
    });
    clearAuthToken();
  });
});

