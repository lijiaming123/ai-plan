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

const mockListRows: PlanListRow[] = [
  {
    id: "plan_a",
    goal: "我的计划A",
    deadline: "2026-12-01T00:00:00.000Z",
    requirement: "描述 A",
    type: "general",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

describe("PlanOverviewPage archive/unarchive", () => {
  afterEach(() => {
    setApiClient(createApiClient());
    vi.restoreAllMocks();
  });

  it("应支持更多菜单归档计划并可撤销", async () => {
    clearAuthToken();
    planListSearchQuery.value = "";
    setAuthToken("token_123");

    const listPlans = vi.fn().mockResolvedValue({ plans: mockListRows });
    const archivePlan = vi.fn().mockResolvedValue({ ok: true });
    const unarchivePlan = vi.fn().mockResolvedValue({ ok: true });

    setApiClient({
      ...createApiClient(),
      listPlans,
      listDeletedPlans: vi.fn().mockResolvedValue({ plans: [] }),
      archivePlan,
      unarchivePlan,
    });

    const router = createAppRouter(createMemoryHistory());
    await router.push("/plans");
    await router.isReady();

    const wrapper = mount(PlanOverviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.get('[data-testid="plan-more-plan_a"]').trigger("click");
    await wrapper.get('[data-testid="plan-archive-plan_a"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="confirm-archive-dialog"]').exists()).toBe(
      true,
    );
    await wrapper
      .get('[data-testid="confirm-archive-dialog"] [data-testid="ui-confirm-ok"]')
      .trigger("click");
    await flushPromises();

    expect(archivePlan).toHaveBeenCalledWith({ id: "plan_a", token: "token_123" });
    expect(wrapper.findAll('[data-testid="plan-card"]').length).toBe(0);
    expect(wrapper.get('[data-testid="recently-archived-banner"]').text()).toContain("已归档");

    await wrapper.get('[data-testid="undo-archive"]').trigger("click");
    await flushPromises();

    expect(unarchivePlan).toHaveBeenCalledWith({ id: "plan_a", token: "token_123" });
    expect(listPlans).toHaveBeenCalledTimes(2);
  });
});

