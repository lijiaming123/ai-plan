import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory } from "vue-router";
import { createAppRouter } from "../src/router";
import DashboardPage from "../src/features/dashboard/DashboardPage.vue";
import { createApiClient, getApiClient, setApiClient } from "../src/lib/api-client";
import { clearAuthToken, setAuthToken, setUserEmail } from "../src/stores/auth";

function demoJwt() {
  const payload = Buffer.from(
    JSON.stringify({ sub: "user_demo", role: "user" }),
  ).toString("base64");
  return `h.${payload}.s`;
}

function emptyYearDays(year: number) {
  const days: { date: string; status: "none" }[] = [];
  const d = new Date(year, 0, 1);
  while (d.getFullYear() === year) {
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    days.push({ date: `${y}-${m}-${day}`, status: "none" });
    d.setDate(d.getDate() + 1);
  }
  return days;
}

describe("DashboardPage 概览与热力图", () => {
  beforeEach(() => {
    clearAuthToken();
    const noopFetch = vi.fn(() =>
      Promise.reject(new Error("unexpected fetch")),
    ) as unknown as typeof fetch;
    const base = createApiClient({
      baseURL: "http://test.local",
      fetchImpl: noopFetch,
    });
    setApiClient({
      ...base,
      getPlanHeatmap: vi.fn().mockResolvedValue({
        year: 2026,
        timeZone: "local",
        days: emptyYearDays(2026),
      }),
      listPlans: vi.fn().mockResolvedValue({
        plans: [
          {
            id: "plan_recent_1",
            goal: "示例计划 Alpha",
            deadline: "2026-12-01T00:00:00.000Z",
            requirement: "完成里程碑与复盘",
            type: "general",
            status: "active",
            createdAt: "2026-04-01T00:00:00.000Z",
          },
        ],
      }),
    });
  });

  it("登录态应拉取热力图并渲染网格", async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push("/dashboard");
    await router.isReady();

    setAuthToken(demoJwt());
    setUserEmail("u@test.dev");

    const wrapper = mount(DashboardPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(getApiClient().getPlanHeatmap).toHaveBeenCalled();
    expect(wrapper.text()).toContain("概览");
    expect(wrapper.text()).toContain("计划打卡热力图");
    expect(wrapper.find('[data-testid="plan-heatmap-grid"]').exists()).toBe(
      true,
    );
    expect(wrapper.text()).toContain("最近计划");
    expect(getApiClient().listPlans).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "deadline" }),
    );
    expect(wrapper.find('[data-testid="recent-plans-list"]').exists()).toBe(
      true,
    );
    expect(wrapper.text()).toContain("示例计划 Alpha");
  });

  it("应在概览顶部汇总今日待处理、逾期与即将截止计划", async () => {
    setApiClient({
      ...createApiClient({
        baseURL: "http://test.local",
        fetchImpl: vi.fn() as unknown as typeof fetch,
      }),
      getPlanHeatmap: vi.fn().mockResolvedValue({
        year: 2026,
        timeZone: "local",
        days: emptyYearDays(2026),
      }),
      listPlans: vi.fn().mockResolvedValue({
        plans: [
          {
            id: "plan_today",
            goal: "今日待打卡",
            deadline: "2026-12-01T00:00:00.000Z",
            requirement: "完成今日任务",
            type: "study",
            status: "active",
            createdAt: "2026-04-01T00:00:00.000Z",
            todayMissing: true,
          },
          {
            id: "plan_overdue",
            goal: "已逾期计划",
            deadline: "2020-01-01T00:00:00.000Z",
            requirement: "已经超过截止日",
            type: "work",
            status: "active",
            createdAt: "2019-12-01T00:00:00.000Z",
            completed: false,
          },
          {
            id: "plan_done",
            goal: "已完成计划",
            deadline: "2020-01-01T00:00:00.000Z",
            requirement: "不应计入逾期",
            type: "general",
            status: "active",
            createdAt: "2019-12-01T00:00:00.000Z",
            completed: true,
          },
        ],
      }),
    });

    const router = createAppRouter(createMemoryHistory());
    await router.push("/dashboard");
    await router.isReady();

    setAuthToken(demoJwt());
    setUserEmail("u@test.dev");

    const wrapper = mount(DashboardPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const summary = wrapper.find('[data-testid="dashboard-action-summary"]');
    expect(summary.exists()).toBe(true);
    expect(summary.text()).toContain("今日待处理");
    expect(summary.text()).toContain("1 项");
    expect(summary.text()).toContain("已逾期");
    expect(summary.text()).toContain("1 项");
    expect(summary.text()).toContain("即将截止");
    expect(summary.get('[data-testid="dashboard-action-card-today"]').attributes("href")).toBe(
      "/plans/plan_today",
    );
    expect(
      summary.get('[data-testid="dashboard-action-card-overdue"]').attributes("href"),
    ).toBe("/plans/plan_overdue");
  });

  it("最近计划的需求摘要应去除 Markdown 脚手架", async () => {
    setApiClient({
      ...createApiClient({
        baseURL: "http://test.local",
        fetchImpl: vi.fn() as unknown as typeof fetch,
      }),
      getPlanHeatmap: vi.fn().mockResolvedValue({
        year: 2026,
        timeZone: "local",
        days: emptyYearDays(2026),
      }),
      listPlans: vi.fn().mockResolvedValue({
        plans: [
          {
            id: "plan_md",
            goal: "前端学习",
            deadline: "2026-12-01T00:00:00.000Z",
            requirement:
              "**场景判断** ***类型**: 学习***依据**: 用户明确指定要完成 Vue3。",
            type: "study",
            status: "active",
            createdAt: "2026-04-01T00:00:00.000Z",
          },
        ],
      }),
    });

    const router = createAppRouter(createMemoryHistory());
    await router.push("/dashboard");
    await router.isReady();

    setAuthToken(demoJwt());
    setUserEmail("u@test.dev");

    const wrapper = mount(DashboardPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain("用户明确指定要完成 Vue3");
    expect(text).not.toContain("**");
  });

  it("接口失败时应触发错误提示", async () => {
    setApiClient({
      ...createApiClient({
        baseURL: "http://test.local",
        fetchImpl: vi.fn() as unknown as typeof fetch,
      }),
      getPlanHeatmap: vi.fn().mockRejectedValue(new Error("Request failed: 500")),
      listPlans: vi.fn().mockResolvedValue({ plans: [] }),
    });

    const router = createAppRouter(createMemoryHistory());
    await router.push("/dashboard");
    await router.isReady();

    setAuthToken(demoJwt());
    setUserEmail("u@test.dev");

    const wrapper = mount(DashboardPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="error-toast"]').exists()).toBe(true);
  });

  it("最近计划接口失败时应在区块内展示错误而不影响热力图", async () => {
    setApiClient({
      ...createApiClient({
        baseURL: "http://test.local",
        fetchImpl: vi.fn() as unknown as typeof fetch,
      }),
      getPlanHeatmap: vi.fn().mockResolvedValue({
        year: 2026,
        timeZone: "local",
        days: emptyYearDays(2026),
      }),
      listPlans: vi.fn().mockRejectedValue(new Error("网络异常")),
    });

    const router = createAppRouter(createMemoryHistory());
    await router.push("/dashboard");
    await router.isReady();

    setAuthToken(demoJwt());
    setUserEmail("u@test.dev");

    const wrapper = mount(DashboardPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="plan-heatmap-grid"]').exists()).toBe(
      true,
    );
    expect(wrapper.text()).toContain("网络异常");
    expect(wrapper.find('[data-testid="recent-plans-list"]').exists()).toBe(
      false,
    );
  });
});
