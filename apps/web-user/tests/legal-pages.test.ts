import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createMemoryHistory } from 'vue-router';
import { createAppRouter } from '../src/router';
import { clearAuthToken } from '../src/stores/auth';
import { createApiClient, setApiClient } from '../src/lib/api-client';
import LoginPage from '../src/features/auth/LoginPage.vue';
import PrivacyPolicyPage from '../src/features/legal/PrivacyPolicyPage.vue';
import TermsOfServicePage from '../src/features/legal/TermsOfServicePage.vue';
import HelpPage from '../src/features/help/HelpPage.vue';
import ForgotPasswordPage from '../src/features/auth/ForgotPasswordPage.vue';

describe('legal pages and consent', () => {
  beforeEach(() => {
    clearAuthToken();
    setApiClient({
      ...createApiClient(),
      getCaptcha: vi.fn().mockResolvedValue({
        captchaId: 'c1',
        imageSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>',
      }),
      verifyOtp: vi.fn().mockResolvedValue({
        token: 't1',
        phone: '13800138000',
        userId: 'u1',
      }),
    });
  });

  it('未登录可访问隐私政策与用户协议页面', async () => {
    const router = createAppRouter(createMemoryHistory());

    await router.push('/legal/privacy');
    await router.isReady();
    expect(router.currentRoute.value.path).toBe('/legal/privacy');

    const privacy = mount(PrivacyPolicyPage, { global: { plugins: [router] } });
    expect(privacy.get('[data-testid="privacy-title"]').text()).toBe('隐私政策');
    expect(privacy.text()).toContain('我们如何收集和使用您的个人信息');

    await router.push('/legal/terms');
    await router.isReady();
    const terms = mount(TermsOfServicePage, { global: { plugins: [router] } });
    expect(terms.get('[data-testid="terms-title"]').text()).toBe('用户服务协议');
    expect(terms.text()).toContain('AI 生成内容说明');
  });

  it('登录页与忘记密码页应展示法律文档链接', async () => {
    const router = createAppRouter(createMemoryHistory());

    await router.push('/auth/login');
    await router.isReady();
    const login = mount(LoginPage, { global: { plugins: [router] } });
    expect(login.get('[data-testid="legal-link-privacy"]').attributes('href')).toBe('/legal/privacy');
    expect(login.get('[data-testid="legal-link-terms"]').attributes('href')).toBe('/legal/terms');

    const forgot = mount(ForgotPasswordPage, { global: { plugins: [router] } });
    expect(forgot.get('[data-testid="legal-link-privacy"]').exists()).toBe(true);
  });

  it('帮助页应展示法律与合规入口', async () => {
    const router = createAppRouter(createMemoryHistory());
    const help = mount(HelpPage, { global: { plugins: [router] } });
    expect(help.get('[data-testid="help-legal-section"]').exists()).toBe(true);
    expect(help.get('[data-testid="help-link-privacy"]').attributes('href')).toBe('/legal/privacy');
    expect(help.text()).toContain('隐私政策与用户协议在哪里');
  });

  it('注册未勾选协议时不应提交', async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      token: 't2',
      phone: '13800138001',
      userId: 'u2',
    });
    setApiClient({
      ...createApiClient(),
      getCaptcha: vi.fn().mockResolvedValue({
        captchaId: 'c1',
        imageSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>',
      }),
      verifyOtp,
    });

    const router = createAppRouter(createMemoryHistory());
    await router.push('/auth/register');
    await router.isReady();

    const wrapper = mount(LoginPage, { global: { plugins: [router] } });
    await wrapper.get('input[aria-label="手机号"]').setValue('13800138001');
    await wrapper.get('input[aria-label="验证码"]').setValue('123456');
    await wrapper.get('input[aria-label="密码"]').setValue('SecureP1!');
    await wrapper.get('input[aria-label="确认密码"]').setValue('SecureP1!');
    await nextTick();
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('请先阅读并同意用户协议与隐私政策');
  });

  it('注册勾选协议后应可提交', async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      token: 't3',
      phone: '13800138002',
      userId: 'u3',
    });
    setApiClient({
      ...createApiClient(),
      getCaptcha: vi.fn().mockResolvedValue({
        captchaId: 'c1',
        imageSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>',
      }),
      verifyOtp,
    });

    const router = createAppRouter(createMemoryHistory());
    await router.push('/auth/register');
    await router.isReady();

    const wrapper = mount(LoginPage, { global: { plugins: [router] } });
    await wrapper.get('input[aria-label="手机号"]').setValue('13800138002');
    await wrapper.get('input[aria-label="验证码"]').setValue('654321');
    await wrapper.get('input[aria-label="密码"]').setValue('SecureP2!');
    await wrapper.get('input[aria-label="确认密码"]').setValue('SecureP2!');
    await wrapper.get('[data-testid="register-legal-consent"] input').setValue(true);
    await nextTick();
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(verifyOtp).toHaveBeenCalled();
  });
});
