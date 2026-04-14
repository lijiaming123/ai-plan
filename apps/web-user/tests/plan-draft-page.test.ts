import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory } from "vue-router";
import PlanDraftPage from "../src/features/plans/PlanDraftPage.vue";
import { createAppRouter } from "../src/router";
import { clearAuthToken, setAuthToken } from "../src/stores/auth";
import { setApiClient } from "../src/lib/api-client";
import {
  consumeAssistantDraftStream,
  consumeRegenerateDraftStream,
  storeDraftStreamPayload,
} from "../src/lib/plan-assistant-stream";

vi.mock("../src/lib/plan-assistant-stream", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("../src/lib/plan-assistant-stream")>();
  return {
    ...mod,
    consumeAssistantDraftStream: vi.fn(),
    consumeRegenerateDraftStream: vi.fn(),
  };
});

function mockMatchMediaDesktop() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: typeof query === "string" && query.includes("min-width"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe("PlanDraftPage", () => {
  const getPlanMock = vi.fn();
  const getPlanDraftMock = vi.fn();
  const regeneratePlanMock = vi.fn();
  const confirmPlanMock = vi.fn();
  const patchPlanScheduleSlotMock = vi.fn();

  const draftPayload = {
    versions: [
      {
        version: 1,
        requirement: "需求 A",
        deadline: new Date().toISOString(),
        createdAt: "2026-04-01T10:00:00.000Z",
        stages: [
          {
            name: "第一阶段",
            sortOrder: 1,
            tasks: [{ id: "t1", title: "任务一", order: 1 }],
          },
        ],
      },
      {
        version: 2,
        requirement: "需求 B",
        deadline: new Date().toISOString(),
        createdAt: "2026-04-02T10:00:00.000Z",
        stages: [
          {
            name: "第二阶段",
            sortOrder: 1,
            tasks: [{ id: "t2", title: "任务二", order: 1 }],
          },
        ],
      },
    ],
    maxVersions: 3,
    confirmedVersion: null as number | null,
    canRegenerate: true,
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    sessionStorage.clear();
    mockMatchMediaDesktop();
    getPlanMock.mockReset();
    getPlanDraftMock.mockReset();
    regeneratePlanMock.mockReset();
    confirmPlanMock.mockReset();

    getPlanMock.mockResolvedValue({
      id: "plan_1",
      goal: "测试目标",
      deadline: new Date().toISOString(),
      requirement: "",
      type: "general",
      status: "draft",
    });
    getPlanDraftMock.mockResolvedValue({
      goal: "测试目标",
      deadline: new Date().toISOString(),
      type: "general",
      requirement: "",
      ...draftPayload,
    });
    regeneratePlanMock.mockResolvedValue({
      versions: draftPayload.versions,
      maxVersions: 3,
      confirmedVersion: null,
      canRegenerate: true,
    });
    confirmPlanMock.mockResolvedValue({
      plan: { id: "plan_1", goal: "测试目标", status: "active" },
      confirmedVersion: 2,
    });
    patchPlanScheduleSlotMock.mockReset();

    clearAuthToken();
    setAuthToken("token_123");
    setApiClient({
      login: vi.fn(),
      createPlan: vi.fn(),
      createSubmission: vi.fn(),
      planAssistant: vi.fn(),
      parsePlanFile: vi.fn(),
      getPlan: getPlanMock,
      getPlanDraft: getPlanDraftMock,
      patchPlanScheduleSlot: patchPlanScheduleSlotMock,
      postPlanScheduleSlotCheckin: vi.fn(),
      regeneratePlan: regeneratePlanMock,
      confirmPlan: confirmPlanMock,
      comparePlanVersions: vi.fn(),
    });

    vi.mocked(consumeAssistantDraftStream).mockReset();
    vi.mocked(consumeRegenerateDraftStream).mockReset();
    vi.mocked(consumeAssistantDraftStream).mockImplementation(
      async (_b, _id, _t, _p, handlers) => {
        handlers.onDone();
      },
    );
    vi.mocked(consumeRegenerateDraftStream).mockImplementation(
      async (_b, _id, _t, _body, handlers) => {
        handlers.onDelta("片段");
        handlers.onDone();
      },
    );
  });

  it("应渲染草稿卡片并支持点击选中版本", async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push("/plans/plan_1/draft");
    await router.isReady();

    const wrapper = mount(PlanDraftPage, {
      global: { plugins: [router] },
      attachTo: document.body,
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="draft-card-v1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="draft-card-v2"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain("任务一");
    expect(wrapper.text()).not.toContain("任务二");

    await wrapper
      .get('[data-testid="draft-card-v1"] .draft-card-head')
      .trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="draft-regenerate"]').trigger("click");
    await flushPromises();

    expect(consumeRegenerateDraftStream).toHaveBeenCalledWith(
      expect.anything(),
      "plan_1",
      "token_123",
      expect.objectContaining({
        requirement: "需求 A",
        granularityMode: "smart",
      }),
      expect.any(Object),
    );
    wrapper.unmount();
  });

  it("重新生成成功后应立即出现新版本卡片（不依赖刷新）", async () => {
    const v3 = {
      version: 3,
      requirement: "需求 C",
      deadline: new Date().toISOString(),
      createdAt: "2026-04-03T10:00:00.000Z",
      stages: [
        {
          name: "第三阶段",
          sortOrder: 1,
          tasks: [{ id: "t3", title: "任务三", order: 1 }],
        },
      ],
    };
    getPlanDraftMock
      .mockResolvedValueOnce({
        goal: "测试目标",
        deadline: new Date().toISOString(),
        type: "general",
        requirement: "",
        ...draftPayload,
      })
      .mockResolvedValue({
        goal: "测试目标",
        deadline: new Date().toISOString(),
        type: "general",
        requirement: "",
        ...draftPayload,
        versions: [...draftPayload.versions, v3],
        canRegenerate: false,
      });

    const router = createAppRouter(createMemoryHistory());
    await router.push("/plans/plan_1/draft");
    await router.isReady();

    const wrapper = mount(PlanDraftPage, {
      global: { plugins: [router] },
      attachTo: document.body,
    });
    await flushPromises();

    await wrapper
      .get('[data-testid="draft-card-v2"] .draft-card-head')
      .trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="draft-regenerate"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="draft-card-v3"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("流式生成进行中应禁用重新生成按钮", async () => {
    vi.mocked(consumeAssistantDraftStream).mockImplementation(
      async (_base, _planId, _token, _payload, _handlers) => {
        await new Promise(() => {
          /* 故意不结束，保持 assistantStreaming */
        });
      },
    );

    storeDraftStreamPayload("plan_1", {
      assistantPrompt: "p",
      startDate: "2026-01-01",
      cycle: "week",
      endDate: "2026-01-08",
    });

    const router = createAppRouter(createMemoryHistory());
    await router.push("/plans/plan_1/draft");
    await router.isReady();

    const wrapper = mount(PlanDraftPage, {
      global: { plugins: [router] },
      attachTo: document.body,
    });
    await flushPromises();

    const regen = wrapper.get('[data-testid="draft-regenerate"]');
    expect(regen.attributes("disabled")).toBeDefined();

    wrapper.unmount();
  });

  it("应渲染 schedule 打卡表面板（若后端返回）", async () => {
    getPlanDraftMock.mockResolvedValueOnce({
      goal: "测试目标",
      deadline: new Date().toISOString(),
      type: "general",
      requirement: "",
      ...draftPayload,
      versions: [
        {
          ...draftPayload.versions[0],
          schedule: {
            granularity: "day",
            slots: [
              {
                slotKey: "2026-04-10",
                generatedContent: "A",
                content: "A",
                contentSource: "generated",
              },
            ],
          },
        },
      ],
    });

    const router = createAppRouter(createMemoryHistory());
    await router.push("/plans/plan_1/draft");
    await router.isReady();

    const wrapper = mount(PlanDraftPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="draft-schedule-v1"]').exists()).toBe(
      true,
    );
    expect(wrapper.text()).toContain("打卡计划");
    expect(wrapper.text()).toContain("2026-04-10");
    wrapper.unmount();
  });

  it("流式生成时：贴底才自动滚到最新，上滑后不抢滚动条", async () => {
    let capturedHandlers:
      | Parameters<typeof consumeAssistantDraftStream>[4]
      | null = null;
    vi.mocked(consumeAssistantDraftStream).mockImplementation(
      async (_base, _planId, _token, _payload, handlers) => {
        capturedHandlers = handlers;
      },
    );

    // 触发 v1 流式
    storeDraftStreamPayload("plan_1", {
      assistantPrompt: "p",
      startDate: "2026-01-01",
      cycle: "week",
      endDate: "2026-01-08",
    });

    const router = createAppRouter(createMemoryHistory());
    await router.push("/plans/plan_1/draft");
    await router.isReady();

    const wrapper = mount(PlanDraftPage, {
      global: { plugins: [router] },
      attachTo: document.body,
    });
    await flushPromises();

    const scrollEls = wrapper
      .findAll(".draft-card-scroll")
      .map((w) => w.element as HTMLElement);
    expect(scrollEls.length).toBeGreaterThan(0);

    // JSDOM 无布局：对所有候选滚动容器设置尺寸（桌面卡片与移动卡片会同时存在于 DOM）
    for (const el of scrollEls) {
      Object.defineProperty(el, "clientHeight", { value: 200, configurable: true });
      Object.defineProperty(el, "scrollHeight", { value: 1000, configurable: true });
      el.scrollTop = 800; // 贴底（gap=0）
    }

    expect(capturedHandlers).not.toBeNull();
    capturedHandlers!.onDelta("a");
    await flushPromises();
    expect(scrollEls.some((el) => el.scrollTop === 1000)).toBe(true);

    // 用户上滑离开底部
    for (const el of scrollEls) {
      el.scrollTop = 0;
      el.dispatchEvent(new Event("scroll"));
    }

    capturedHandlers!.onDelta("b");
    await flushPromises();
    expect(scrollEls.every((el) => el.scrollTop === 0)).toBe(true);

    wrapper.unmount();
  });

  it("点击确认应出现二次确认弹窗", async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push("/plans/plan_1/draft");
    await router.isReady();

    const wrapper = mount(PlanDraftPage, {
      global: { plugins: [router] },
      attachTo: document.body,
    });
    await flushPromises();

    expect(
      document.querySelector('[data-testid="draft-confirm-modal"]'),
    ).toBeNull();
    await wrapper.get('[data-testid="draft-open-confirm"]').trigger("click");
    await flushPromises();

    const modal = document.querySelector('[data-testid="draft-confirm-modal"]');
    expect(modal).not.toBeNull();
    expect(modal?.textContent ?? "").toContain("确认保存该版本");
    wrapper.unmount();
  });

  it("切换颗粒度后点击重新生成应先弹确认，再创建新版本", async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push("/plans/plan_1/draft");
    await router.isReady();

    const wrapper = mount(PlanDraftPage, {
      global: { plugins: [router] },
      attachTo: document.body,
    });
    await flushPromises();

    await wrapper.get('[data-testid="draft-regenerate-menu"]').trigger("click");
    await flushPromises();
    await wrapper
      .get('[data-testid="draft-regenerate-granularity-rough"]')
      .trigger("click");
    await wrapper.get('[data-testid="draft-regenerate"]').trigger("click");
    await flushPromises();
    expect(
      document.querySelector('[data-testid="draft-granularity-confirm-modal"]'),
    ).not.toBeNull();
    expect(consumeRegenerateDraftStream).not.toHaveBeenCalled();

    (
      document.querySelector(
        '[data-testid="draft-granularity-confirm-submit"]',
      ) as HTMLButtonElement | null
    )?.click();
    await flushPromises();

    expect(consumeRegenerateDraftStream).toHaveBeenCalledWith(
      expect.anything(),
      "plan_1",
      "token_123",
      expect.objectContaining({
        requirement: "需求 B",
        granularityMode: "rough",
      }),
      expect.any(Object),
    );
    wrapper.unmount();
  });

  it("确认成功后应 router.push 到正式详情页", async () => {
    const router = createAppRouter(createMemoryHistory());
    const push = vi.spyOn(router, "push");
    await router.push("/plans/plan_1/draft");
    await router.isReady();

    const wrapper = mount(PlanDraftPage, {
      global: { plugins: [router] },
      attachTo: document.body,
    });
    await flushPromises();

    await wrapper.get('[data-testid="draft-open-confirm"]').trigger("click");
    await flushPromises();
    (
      document.querySelector(
        '[data-testid="draft-confirm-submit"]',
      ) as HTMLButtonElement | null
    )?.click();
    await flushPromises();

    expect(confirmPlanMock).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith({
      name: "plan-detail",
      params: { id: "plan_1" },
    });
    wrapper.unmount();
  });

  it("getPlanDraft 返回 409 draft is closed 时应 router.replace 到详情页", async () => {
    getPlanDraftMock.mockRejectedValue(
      new Error("Request failed: 409 - draft is closed"),
    );

    const router = createAppRouter(createMemoryHistory());
    const replace = vi.spyOn(router, "replace");
    await router.push("/plans/plan_1/draft");
    await router.isReady();

    const w = mount(PlanDraftPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(replace).toHaveBeenCalledWith({
      name: "plan-detail",
      params: { id: "plan_1" },
    });
    w.unmount();
  });

  it("已定稿计划访问 /draft 时草稿接口 404 后应拉取 Plan 并 replace 到详情页", async () => {
    getPlanDraftMock.mockRejectedValue(
      new Error("Request failed: 404 - plan not found"),
    );
    getPlanMock.mockResolvedValue({
      id: "plan_1",
      goal: "已激活",
      deadline: new Date().toISOString(),
      requirement: "",
      type: "general",
      status: "active",
    });

    const router = createAppRouter(createMemoryHistory());
    const replace = vi.spyOn(router, "replace");
    await router.push("/plans/plan_1/draft");
    await router.isReady();

    const w = mount(PlanDraftPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(getPlanDraftMock).toHaveBeenCalled();
    expect(getPlanMock).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith({
      name: "plan-detail",
      params: { id: "plan_1" },
    });
    w.unmount();
  });
});
