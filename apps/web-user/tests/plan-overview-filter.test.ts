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
    deadline: "2026-12-01T00:00:00.000Z",
    requirement: "描述 A",
    type: "general",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "plan_b",
    goal: "进行中 B",
    deadline: "2026-12-02T00:00:00.000Z",
    requirement: "描述 B",
    type: "general",
    status: "active",
    createdAt: "2026-01-02T00:00:00.000Z",
  },
  {
    id: "plan_c",
    goal: "个人健身年度目标",
    deadline: "2026-12-03T00:00:00.000Z",
    requirement: "健身相关",
    type: "general",
    status: "active",
    createdAt: "2026-01-03T00:00:00.000Z",
  },
  {
    id: "plan_d",
    goal: "已定稿 D",
    deadline: "2026-12-04T00:00:00.000Z",
    requirement: "说明",
    type: "general",
    status: "active",
    createdAt: "2026-01-04T00:00:00.000Z",
  },
  {
    id: "plan_e",
    goal: "已定稿 E",
    deadline: "2026-12-05T00:00:00.000Z",
    requirement: "说明",
    type: "general",
    status: "active",
    createdAt: "2026-01-05T00:00:00.000Z",
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

    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(5);

    await wrapper.get('[data-testid="filter-进行中"]').trigger("click");
    await flushPromises();
    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(5);

    await wrapper.get('[data-testid="filter-已完成"]').trigger("click");
    await flushPromises();
    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(0);

    await wrapper.get('[data-testid="filter-未开始"]').trigger("click");
    await flushPromises();
    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(0);
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

    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(5);
    // legacy 中文参数会被自动迁移为英文
    expect(router.currentRoute.value.query.status).toBe("in_progress");

    await wrapper.get('[data-testid="filter-未开始"]').trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.query.status).toBe("not_started");
    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(0);
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
    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(5);

    planListSearchQuery.value = "健身";
    await flushPromises();
    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(1);

    planListSearchQuery.value = "";
    await flushPromises();
    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(5);
  });
});
