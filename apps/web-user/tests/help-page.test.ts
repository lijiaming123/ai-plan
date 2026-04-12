import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import { createAppRouter } from '../src/router';
import HelpPage from '../src/features/help/HelpPage.vue';

describe('HelpPage', () => {
  it('应渲染搜索、分类与 FAQ 列表', async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push('/help');
    await router.isReady();

    const wrapper = mount(HelpPage, { global: { plugins: [router] } });

    expect(wrapper.find('[data-testid="help-search"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="help-cat-all"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="help-faq-list"]').exists()).toBe(true);

    const items = wrapper.findAll('[data-testid^="help-faq-item-"]');
    expect(items.length).toBeGreaterThan(3);
  });

  it('搜索无结果时应展示空状态', async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push('/help');
    await router.isReady();

    const wrapper = mount(HelpPage, { global: { plugins: [router] } });
    const input = wrapper.get('[data-testid="help-search"]');

    await input.setValue('zzzzzz_not_in_faq_99999');
    expect(wrapper.find('[data-testid="help-faq-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="help-faq-list"]').exists()).toBe(false);
  });

  it('切换分类应减少可见条目', async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push('/help');
    await router.isReady();

    const wrapper = mount(HelpPage, { global: { plugins: [router] } });
    const allCount = wrapper.findAll('[data-testid^="help-faq-item-"]').length;

    await wrapper.get('[data-testid="help-cat-template"]').trigger('click');
    const templateCount = wrapper.findAll('[data-testid^="help-faq-item-"]').length;
    expect(templateCount).toBeLessThan(allCount);
    expect(templateCount).toBeGreaterThanOrEqual(1);
  });

  it('应提供反馈提交按钮', async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push('/help');
    await router.isReady();

    const wrapper = mount(HelpPage, { global: { plugins: [router] } });
    expect(wrapper.find('[data-testid="help-feedback-submit"]').exists()).toBe(true);
    const btn = wrapper.get('[data-testid="help-feedback-submit"]');
    expect(btn.attributes('disabled')).toBeDefined();

    await wrapper.get('[data-testid="help-feedback-body"]').setValue('测试反馈内容');
    expect(wrapper.get('[data-testid="help-feedback-submit"]').attributes('disabled')).toBeUndefined();
  });
});
