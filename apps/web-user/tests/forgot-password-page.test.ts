import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory } from "vue-router";
import ForgotPasswordPage from "../src/features/auth/ForgotPasswordPage.vue";
import { createAppRouter } from "../src/router";
import { createApiClient, setApiClient } from "../src/lib/api-client";

describe("ForgotPasswordPage", () => {
  const forgotPassword = vi.fn();

  beforeEach(() => {
    forgotPassword.mockReset();
    setApiClient({
      ...createApiClient(),
      forgotPassword,
    });
  });

  it("提交合法邮箱后展示成功说明", async () => {
    forgotPassword.mockResolvedValue({
      ok: true,
      mode: "demo",
      message: "请求已受理。当前为演示环境",
    });

    const router = createAppRouter(createMemoryHistory());
    const wrapper = mount(ForgotPasswordPage, {
      global: { plugins: [router] },
    });

    await wrapper.get('[data-testid="forgot-password-email"]').setValue("a@b.co");
    await wrapper.get('[data-testid="forgot-password-submit"]').trigger("click");
    await flushPromises();

    expect(forgotPassword).toHaveBeenCalledWith({ email: "a@b.co" });
    expect(wrapper.get('[data-testid="forgot-password-success"]').text()).toContain(
      "演示环境",
    );
  });

  it("空邮箱应提示且不调用接口", async () => {
    const router = createAppRouter(createMemoryHistory());
    const wrapper = mount(ForgotPasswordPage, {
      global: { plugins: [router] },
    });

    await wrapper.get('[data-testid="forgot-password-submit"]').trigger("click");
    await flushPromises();

    expect(forgotPassword).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="forgot-password-field-error"]').text()).toContain(
      "请输入",
    );
  });
});
