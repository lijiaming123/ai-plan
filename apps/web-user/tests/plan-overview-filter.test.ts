import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory } from "vue-router";
import { createAppRouter } from "../src/router";
import PlanOverviewPage from "../src/features/plans/PlanOverviewPage.vue";
import { clearAuthToken, setAuthToken } from "../src/stores/auth";
import { planListSearchQuery } from "../src/stores/plan-search-query";
import {
  createApiClient,
  setApiClient,
  type PlanListRow,
} from "../src/lib/api-client";

/** 与后端 GET /plans 一致：仅非草稿 */
const mockListRows: PlanListRow[] = [
  {
    id: "plan_a",
    goal: "进行中 A",
    startDate: "2026-01-01T00:00:00.000Z",
    deadline: "2026-12-01T00:00:00.000Z",
    requirement: "描述 A",
    type: "general",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "plan_b",
    goal: "进行中 B",
    startDate: "2026-01-02T00:00:00.000Z",
    deadline: "2026-12-02T00:00:00.000Z",
    requirement: "描述 B",
    type: "general",
    status: "active",
    createdAt: "2026-01-02T00:00:00.000Z",
  },
  {
    id: "plan_c",
    goal: "个人健身年度目标",
    startDate: "2026-01-03T00:00:00.000Z",
    deadline: "2026-12-03T00:00:00.000Z",
    requirement: "健身相关",
    type: "general",
    status: "active",
    createdAt: "2026-01-03T00:00:00.000Z",
  },
  {
    id: "plan_d",
    goal: "已定稿 D",
    // 未开始：开始日期在未来（相对测试运行日）
    startDate: "2099-01-01T00:00:00.000Z",
    deadline: "2026-12-04T00:00:00.000Z",
    requirement: "说明",
    type: "general",
    status: "active",
    createdAt: "2026-01-04T00:00:00.000Z",
  },
  {
    id: "plan_e",
    goal: "已定稿 E",
    completed: true,
    startDate: "2026-01-05T00:00:00.000Z",
    deadline: "2020-12-05T00:00:00.000Z",
    requirement: "说明",
    type: "general",
    status: "active",
    createdAt: "2026-01-05T00:00:00.000Z",
  },
  {
    id: "plan_f",
    goal: "今日待打卡未到截止",
    startDate: "2026-01-01T00:00:00.000Z",
    deadline: "2099-06-01T00:00:00.000Z",
    requirement: "说明",
    type: "general",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    todayMissing: true,
  },
];

describe("PlanOverviewPage filter", () => {
  afterEach(() => {
    setApiClient(createApiClient());
  });

  it("应根据状态筛选计划卡片", async () => {
    clearAuthToken();
    planListSearchQuery.value = "";
    setAuthToken("token_123");
    const listPlans = vi.fn().mockResolvedValue({ plans: mockListRows });
    setApiClient({
      ...createApiClient(),
      listPlans,
    });
    const router = createAppRouter(createMemoryHistory());
    await router.push("/plans");
    await router.isReady();

    const wrapper = mount(PlanOverviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(6);

    await wrapper.get('[data-testid="filter-执行中"]').trigger("click");
    await flushPromises();
    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(4);

    await wrapper.get('[data-testid="filter-已完成"]').trigger("click");
    await flushPromises();
    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(1);

    await wrapper.get('[data-testid="filter-未开始"]').trigger("click");
    await flushPromises();
    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(1);
  });

  it("应与URL查询参数同步筛选状态", async () => {
    clearAuthToken();
    planListSearchQuery.value = "";
    setAuthToken("token_123");
    setApiClient({
      ...createApiClient(),
      listPlans: vi.fn().mockResolvedValue({ plans: mockListRows }),
    });
    const router = createAppRouter(createMemoryHistory());
    await router.push("/plans?status=进行中");
    await router.isReady();

    const wrapper = mount(PlanOverviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(4);
    // legacy 中文参数会被自动迁移为英文
    expect(router.currentRoute.value.query.status).toBe("in_progress");

    await wrapper.get('[data-testid="filter-未开始"]').trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.query.status).toBe("not_started");
    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(1);
  });

  it("应根据顶栏搜索关键字筛选计划卡片", async () => {
    clearAuthToken();
    planListSearchQuery.value = "";
    setAuthToken("token_123");
    setApiClient({
      ...createApiClient(),
      listPlans: vi.fn().mockResolvedValue({ plans: mockListRows }),
    });
    const router = createAppRouter(createMemoryHistory());
    await router.push("/plans");
    await router.isReady();

    const wrapper = mount(PlanOverviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();
    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(6);

    planListSearchQuery.value = "健身";
    await flushPromises();
    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(1);

    planListSearchQuery.value = "";
    await flushPromises();
    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(6);
  });

  it("已完成计划不展示已逾期；今日待打卡未到截止的进度环为琥珀色而非红色", async () => {
    clearAuthToken();
    planListSearchQuery.value = "";
    setAuthToken("token_123");
    setApiClient({
      ...createApiClient(),
      listPlans: vi.fn().mockResolvedValue({ plans: mockListRows }),
    });
    const router = createAppRouter(createMemoryHistory());
    await router.push("/plans?status=completed");
    await router.isReady();

    const wrapper = mount(PlanOverviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const doneCard = wrapper.find('[data-testid="plan-card"]');
    expect(doneCard.text()).toContain("已定稿 E");
    expect(doneCard.text()).not.toContain("已逾期");

    await router.push("/plans?status=in_progress");
    await router.isReady();
    await flushPromises();

    const fCard = wrapper
      .findAll('[data-testid="plan-card"]')
      .find((w) => w.text().includes("今日待打卡未到截止"));
    expect(fCard?.exists()).toBe(true);
    const ringStyle = fCard!.get(".plan-ring-wrap").attributes("style") ?? "";
    expect(ringStyle).not.toContain("244, 63, 94");
    expect(ringStyle).toContain("245, 158, 11");
  });

  it("有 checkinSegments 时进度环使用多段 conic-gradient", async () => {
    clearAuthToken();
    planListSearchQuery.value = "";
    setAuthToken("token_123");
    const rowsWithSeg: PlanListRow[] = [
      {
        id: "plan_seg",
        goal: "多段进度环",
        startDate: "2026-01-01T00:00:00.000Z",
        deadline: "2026-12-01T00:00:00.000Z",
        requirement: "说明",
        type: "general",
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        checkinSegments: ["done", "done", "missed", "upcoming"],
        checkinProgressPercent: 50,
      },
    ];
    setApiClient({
      ...createApiClient(),
      listPlans: vi.fn().mockResolvedValue({ plans: rowsWithSeg }),
    });
    const router = createAppRouter(createMemoryHistory());
    await router.push("/plans");
    await router.isReady();

    const wrapper = mount(PlanOverviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const card = wrapper.get('[data-testid="plan-card"]');
    expect(card.text()).toContain("多段进度环");
    const ringStyle = card.get(".plan-ring-wrap").attributes("style") ?? "";
    expect(ringStyle).toContain("--ring-segments");
    expect(ringStyle).toContain("conic-gradient");
    expect(ringStyle).toContain("229, 231, 235");
  });

  it("列表加载失败时应使用右侧错误提示且正文为中文", async () => {
    clearAuthToken();
    planListSearchQuery.value = "";
    setAuthToken("token_123");
    setApiClient({
      ...createApiClient(),
      listPlans: vi.fn().mockRejectedValue(
        new Error(
          "Request failed: 500 - Can't reach database server at 'localhost:5432'",
        ),
      ),
    });
    const router = createAppRouter(createMemoryHistory());
    await router.push("/plans");
    await router.isReady();

    const wrapper = mount(PlanOverviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="error-toast"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="error-toast"]').text()).toContain("服务暂时不可用");
    expect(wrapper.text()).not.toMatch(/localhost:5432|prisma/i);
  });
});
