import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory } from "vue-router";
import { createAppRouter } from "../src/router";
import PlanTrashPage from "../src/features/plans/PlanTrashPage.vue";
import { clearAuthToken, setAuthToken } from "../src/stores/auth";
import {
  createApiClient,
  setApiClient,
  type DeletedPlanListRow,
} from "../src/lib/api-client";

const mockDeletedRows: DeletedPlanListRow[] = [
  {
    id: "plan_deleted_1",
    goal: "被删除的计划",
    deadline: "2026-12-01T00:00:00.000Z",
    requirement: "描述",
    type: "general",
    createdAt: "2026-01-01T00:00:00.000Z",
    deletedAt: "2026-02-02T00:00:00.000Z",
  },
];

describe("PlanTrashPage", () => {
  afterEach(() => {
    setApiClient(createApiClient());
    clearAuthToken();
    vi.restoreAllMocks();
  });

  it("应渲染最近删除列表，并支持恢复后从列表移除", async () => {
    setAuthToken("token_123");

    const listDeletedPlans = vi.fn().mockResolvedValue({ plans: mockDeletedRows });
    const restorePlan = vi.fn().mockResolvedValue({ ok: true });

    setApiClient({
      ...createApiClient(),
      listDeletedPlans,
      restorePlan,
    });

    const router = createAppRouter(createMemoryHistory());
    await router.push("/plans/trash");
    await router.isReady();

    const wrapper = mount(PlanTrashPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(listDeletedPlans).toHaveBeenCalledWith({ token: "token_123" });
    expect(wrapper.findAll('[data-testid="plan-trash-row"]').length).toBe(1);
    expect(wrapper.text()).toContain("被删除的计划");

    await wrapper.get('[data-testid="plan-restore-plan_deleted_1"]').trigger("click");
    await flushPromises();

    expect(restorePlan).toHaveBeenCalledWith({
      id: "plan_deleted_1",
      token: "token_123",
    });
    expect(wrapper.findAll('[data-testid="plan-trash-row"]').length).toBe(0);
  });
});

