import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createMemoryHistory } from "vue-router";
import ForgotPasswordPage from "../src/features/auth/ForgotPasswordPage.vue";
import { createAppRouter } from "../src/router";
import { createApiClient, setApiClient } from "../src/lib/api-client";

describe("ForgotPasswordPage", () => {
  const sendOtp = vi.fn();
  const verifyOtp = vi.fn();

  beforeEach(() => {
    sendOtp.mockReset();
    verifyOtp.mockReset();
    setApiClient({
      ...createApiClient(),
      sendOtp,
      verifyOtp,
    });
  });

  it("发送验证码：合法手机号应调用 sendOtp(reset)", async () => {
    sendOtp.mockResolvedValue({
      ok: true,
      phone: "13800138000",
      purpose: "reset",
      expiresInSeconds: 300,
      cooldownSeconds: 60,
    });

    const router = createAppRouter(createMemoryHistory());
    const wrapper = mount(ForgotPasswordPage, {
      global: { plugins: [router] },
    });

    await wrapper.get('[data-testid="forgot-password-phone"]').setValue("13800138000");
    await wrapper.get('[data-testid="forgot-password-send"]').trigger("click");
    await flushPromises();

    expect(sendOtp).toHaveBeenCalledWith({ phone: "13800138000", purpose: "reset" });
    expect(wrapper.get('[data-testid="forgot-password-success"]').text()).toContain("验证码已发送");
  });

  it("空手机号点发送应提示且不调用接口", async () => {
    const router = createAppRouter(createMemoryHistory());
    const wrapper = mount(ForgotPasswordPage, {
      global: { plugins: [router] },
    });

    await wrapper.get('[data-testid="forgot-password-send"]').trigger("click");
    await flushPromises();

    expect(sendOtp).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="forgot-password-field-error"]').text()).toContain("请输入");
  });

  it("验证成功应跳转计划页", async () => {
    sendOtp.mockResolvedValue({
      ok: true,
      phone: "13800138000",
      purpose: "reset",
      expiresInSeconds: 300,
      cooldownSeconds: 60,
    });
    verifyOtp.mockResolvedValue({
      token: "jwt_test",
      phone: "13800138000",
      userId: "u1",
    });

    const router = createAppRouter(createMemoryHistory());
    const pushSpy = vi.spyOn(router, "push").mockResolvedValue(undefined);

    const wrapper = mount(ForgotPasswordPage, {
      global: { plugins: [router] },
    });

    await wrapper.get('[data-testid="forgot-password-phone"]').setValue("13800138000");
    await nextTick();
    await wrapper.get('[data-testid="forgot-password-password"]').setValue("Secret12!");
    await nextTick();
    await wrapper.get('[data-testid="forgot-password-password-confirm"]').setValue("Secret12!");
    await nextTick();
    await wrapper.get('[data-testid="forgot-password-code"]').setValue("123456");
    await nextTick();
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(verifyOtp).toHaveBeenCalledWith({
      phone: "13800138000",
      code: "123456",
      purpose: "reset",
      password: "Secret12!",
      passwordConfirm: "Secret12!",
    });
    expect(pushSpy).toHaveBeenCalledWith("/plans");
    pushSpy.mockRestore();
  });
});
