import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory } from "vue-router";
import { createAppRouter } from "../src/router";
import PlanPomodoroBar from "../src/components/PlanPomodoroBar.vue";

describe("PlanPomodoroBar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn() as unknown as typeof Element.prototype.scrollIntoView;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("开始专注后倒计时递减，暂停后不再递减", async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push("/plans/plan_x");
    await router.isReady();

    const wrapper = mount(PlanPomodoroBar, {
      props: { title: "测试计划" },
      global: { plugins: [router] },
    });

    await wrapper.get('[data-testid="plan-pomodoro-toggle"]').trigger("click");
    await wrapper.get('[data-testid="plan-pomodoro-start"]').trigger("click");
    expect(wrapper.get('[data-testid="plan-pomodoro-phase"]').text()).toContain("专注中");

    await vi.advanceTimersByTimeAsync(5000);
    await flushPromises();
    expect(wrapper.text()).toContain("24:55");

    await wrapper.get('[data-testid="plan-pomodoro-pause"]').trigger("click");
    await vi.advanceTimersByTimeAsync(5000);
    await flushPromises();
    expect(wrapper.text()).toContain("24:55");
  });

  it("专注结束后进入短休阶段", async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push("/plans/plan_x");
    await router.isReady();

    const wrapper = mount(PlanPomodoroBar, {
      props: { title: "T", workSeconds: 3, breakSeconds: 2 },
      global: { plugins: [router] },
    });

    await wrapper.get('[data-testid="plan-pomodoro-toggle"]').trigger("click");
    await wrapper.get('[data-testid="plan-pomodoro-start"]').trigger("click");
    await vi.advanceTimersByTimeAsync(3 * 1000);
    await flushPromises();

    expect(wrapper.get('[data-testid="plan-pomodoro-phase"]').text()).toContain("短休中");
    expect(wrapper.text()).toContain("00:02");
  });
});
