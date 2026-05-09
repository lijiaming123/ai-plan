import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createMemoryHistory } from "vue-router";
import ArchivePage from "../src/features/archive/ArchivePage.vue";
import { createAppRouter } from "../src/router";
import { clearAuthToken, setAuthToken } from "../src/stores/auth";
import { createApiClient, setApiClient } from "../src/lib/api-client";

describe("ArchivePage", () => {
  const listArchivedPlans = vi.fn();
  let lastIntersectionCallback:
    | ((entries: Array<{ isIntersecting: boolean }>) => void)
    | null = null;

  beforeEach(() => {
    listArchivedPlans.mockReset();
    clearAuthToken();
    setAuthToken("token_123");
    lastIntersectionCallback = null;
    // JSDOM 默认没有 IntersectionObserver；这里 mock 以测试无限滚动触发
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).IntersectionObserver = class {
      cb: (entries: Array<{ isIntersecting: boolean }>) => void;
      constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
        this.cb = cb;
        lastIntersectionCallback = cb;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    };
    setApiClient({
      ...createApiClient(),
      listArchivedPlans,
    });
  });

  it("已登录且无归档时展示空态", async () => {
    listArchivedPlans.mockResolvedValue({ plans: [], hasMore: false });

    const router = createAppRouter(createMemoryHistory());
    await router.push("/archive");
    await router.isReady();

    const wrapper = mount(ArchivePage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(listArchivedPlans).toHaveBeenCalledWith({
      token: "token_123",
      sort: "created",
      limit: 20,
      offset: 0,
    });
    expect(wrapper.get('[data-testid="archive-empty"]').text()).toContain("暂无归档");
  });

  it("加载失败时提供重试按钮", async () => {
    listArchivedPlans
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ plans: [], hasMore: false });

    const router = createAppRouter(createMemoryHistory());
    await router.push("/archive");
    await router.isReady();

    const wrapper = mount(ArchivePage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="archive-retry"]').exists()).toBe(true);
    await wrapper.get('[data-testid="archive-retry"]').trigger("click");
    await flushPromises();
    expect(listArchivedPlans).toHaveBeenCalledTimes(2);
  });

  it("切换排序应触发重新拉取", async () => {
    listArchivedPlans.mockResolvedValue({ plans: [], hasMore: false });

    const router = createAppRouter(createMemoryHistory());
    await router.push("/archive");
    await router.isReady();

    const wrapper = mount(ArchivePage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    // 模拟用户已滚动到中间位置
    const scroller = wrapper.get('[data-testid="plan-archive-root"]')
      .element as HTMLElement;
    // 真实滚动容器在组件内部，这里用 query 拿到 ref 对应的 div
    const scrollRoot = wrapper.get(".ui-scrollbar").element as HTMLElement;
    scrollRoot.scrollTop = 123;

    expect(listArchivedPlans).toHaveBeenCalledWith({
      token: "token_123",
      sort: "created",
      limit: 20,
      offset: 0,
    });

    await wrapper.get('[data-testid="archive-sort"]').setValue("deadline");
    await flushPromises();

    expect(listArchivedPlans).toHaveBeenCalledWith({
      token: "token_123",
      sort: "deadline",
      limit: 20,
      offset: 0,
    });
    expect(router.currentRoute.value.query.sort).toBe("deadline");
    expect(scrollRoot.scrollTop).toBe(0);
  });

  it("从 URL query 恢复搜索与排序", async () => {
    listArchivedPlans.mockResolvedValue({ plans: [], hasMore: false });

    const router = createAppRouter(createMemoryHistory());
    await router.push("/archive?sort=deadline&q=hello");
    await router.isReady();

    const wrapper = mount(ArchivePage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(
      (wrapper.get('[data-testid="archive-sort"]').element as HTMLSelectElement)
        .value,
    ).toBe("deadline");
    expect(
      (wrapper.get('[data-testid="archive-search"]').element as HTMLInputElement)
        .value,
    ).toBe("hello");
    expect(listArchivedPlans).toHaveBeenCalledWith({
      token: "token_123",
      sort: "deadline",
      limit: 20,
      offset: 0,
      search: "hello",
    });
  });

  it("清空搜索按钮会清空并触发重新拉取", async () => {
    vi.useFakeTimers();
    listArchivedPlans.mockResolvedValue({ plans: [], hasMore: false });

    const router = createAppRouter(createMemoryHistory());
    await router.push("/archive?q=hello");
    await router.isReady();

    const wrapper = mount(ArchivePage, {
      global: { plugins: [router] },
    });
    await flushPromises();
    expect(listArchivedPlans).toHaveBeenCalledWith(
      expect.objectContaining({ search: "hello" }),
    );

    await wrapper.get('[data-testid="archive-search-clear"]').trigger("click");
    // debounce 触发
    vi.advanceTimersByTime(400);
    await flushPromises();

    expect(router.currentRoute.value.query.q).toBeUndefined();
    expect(listArchivedPlans).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ search: "hello" }),
    );
    vi.useRealTimers();
  });

  it("加载更多时使用递增 offset", async () => {
    const row1 = {
      id: "p1",
      goal: "A",
      deadline: "2026-01-01T00:00:00.000Z",
      requirement: "r",
      type: "general",
      status: "archived",
      createdAt: "2026-01-01T00:00:00.000Z",
      archivedAt: "2026-01-02T00:00:00.000Z",
    };
    const row2 = { ...row1, id: "p2", goal: "B" };
    listArchivedPlans
      .mockResolvedValueOnce({ plans: [row1], hasMore: true })
      .mockResolvedValueOnce({ plans: [row2], hasMore: false });

    const router = createAppRouter(createMemoryHistory());
    await router.push("/archive");
    await router.isReady();

    const wrapper = mount(ArchivePage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(listArchivedPlans).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 0, limit: 20 }),
    );

    // 触底触发 IntersectionObserver
    expect(lastIntersectionCallback).toBeTruthy();
    const scrollRoot = wrapper.get(".ui-scrollbar").element as HTMLElement;
    scrollRoot.scrollTop = 456;
    lastIntersectionCallback?.([{ isIntersecting: true }]);
    await flushPromises();
    await nextTick();

    expect(listArchivedPlans).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 1, limit: 20 }),
    );
    expect(wrapper.findAll('[data-testid^="archive-plan-link-"]')).toHaveLength(2);
    expect(scrollRoot.scrollTop).toBe(456);
  });

  it("加载更多失败时显示具体错误并可重试", async () => {
    const row1 = {
      id: "p1",
      goal: "A",
      deadline: "2026-01-01T00:00:00.000Z",
      requirement: "r",
      type: "general",
      status: "archived",
      createdAt: "2026-01-01T00:00:00.000Z",
      archivedAt: "2026-01-02T00:00:00.000Z",
    };
    const row2 = { ...row1, id: "p2", goal: "B" };
    listArchivedPlans
      .mockResolvedValueOnce({ plans: [row1], hasMore: true })
      .mockRejectedValueOnce(new Error("网络超时"))
      .mockResolvedValueOnce({ plans: [row2], hasMore: false });

    const router = createAppRouter(createMemoryHistory());
    await router.push("/archive");
    await router.isReady();

    const wrapper = mount(ArchivePage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    lastIntersectionCallback?.([{ isIntersecting: true }]);
    await flushPromises();

    expect(wrapper.get('[data-testid="archive-load-more-retry"]').text()).toContain(
      "网络超时",
    );

    await wrapper.get('[data-testid="archive-load-more-retry"]').trigger("click");
    await flushPromises();

    expect(listArchivedPlans).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 1, limit: 20 }),
    );
    expect(wrapper.findAll('[data-testid^="archive-plan-link-"]')).toHaveLength(2);
  });

  it("滚动一段距离后显示回到顶部按钮", async () => {
    listArchivedPlans.mockResolvedValue({ plans: [], hasMore: false });

    const router = createAppRouter(createMemoryHistory());
    await router.push("/archive");
    await router.isReady();

    const wrapper = mount(ArchivePage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const scrollRoot = wrapper.get(".ui-scrollbar").element as HTMLElement;
    scrollRoot.scrollTop = 600;
    scrollRoot.dispatchEvent(new Event("scroll"));
    await nextTick();

    expect(wrapper.find('[data-testid="archive-back-to-top"]').exists()).toBe(
      true,
    );

    await wrapper.get('[data-testid="archive-back-to-top"]').trigger("click");
    expect(scrollRoot.scrollTop).toBe(0);
  });

  it("移回我的计划前显示确认弹窗", async () => {
    const row1 = {
      id: "p1",
      goal: "目标一",
      deadline: "2026-01-01T00:00:00.000Z",
      requirement: "r",
      type: "general",
      status: "archived",
      createdAt: "2026-01-01T00:00:00.000Z",
      archivedAt: "2026-01-02T00:00:00.000Z",
    };
    listArchivedPlans.mockResolvedValue({ plans: [row1], hasMore: false });
    const unarchivePlan = vi.fn().mockResolvedValue({ ok: true });
    setApiClient({
      ...createApiClient(),
      listArchivedPlans,
      unarchivePlan,
    });

    const router = createAppRouter(createMemoryHistory());
    await router.push("/archive");
    await router.isReady();

    const wrapper = mount(ArchivePage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.get('[data-testid="archive-unarchive-p1"]').trigger("click");
    await nextTick();
    await flushPromises();

    expect(wrapper.text()).toContain("移回我的计划？");
    expect(wrapper.find('[data-testid="ui-confirm-dialog"]').exists()).toBe(true);

    await wrapper.get('[data-testid="ui-confirm-ok"]').trigger("click");
    await flushPromises();

    expect(unarchivePlan).toHaveBeenCalledWith({
      id: "p1",
      token: "token_123",
    });
  });

  it("归档页应提供“了解归档”FAQ（默认收起，可展开查看）", async () => {
    listArchivedPlans.mockResolvedValue({ plans: [], hasMore: false });

    const router = createAppRouter(createMemoryHistory());
    await router.push("/archive");
    await router.isReady();

    const wrapper = mount(ArchivePage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="archive-faq-body"]').exists()).toBe(false);

    await wrapper.get('[data-testid="archive-faq-toggle"]').trigger("click");
    await nextTick();

    const body = wrapper.get('[data-testid="archive-faq-body"]');
    expect(body.text()).toContain("归档和删除有什么区别");
    expect(body.text()).toContain("归档后为什么不能打卡/编辑");
    expect(body.text()).toContain("怎么恢复继续执行");
    expect(body.text()).toContain("归档会丢数据吗");
  });
});
