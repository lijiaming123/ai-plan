import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import TaskSubmitPage from '../src/features/submissions/TaskSubmitPage.vue';
import SubmissionResultPage from '../src/features/submissions/SubmissionResultPage.vue';
import { createAppRouter } from '../src/router';
import { clearAuthToken, setAuthToken } from '../src/stores/auth';
import { setApiClient } from '../src/lib/api-client';

describe('submission flow', () => {
  beforeEach(() => {
    clearAuthToken();
    setApiClient({
      login: vi.fn(),
      createPlan: vi.fn(),
      createSubmission: vi.fn().mockResolvedValue({
        id: 's1',
        content: '完成第 1 阶段任务',
        images: [{ id: 'img_1', url: 'local://evidence.png', hash: 'hash_1' }],
      }),
    });
  });

  it('上传证据后应跳转到结果页', async () => {
    setAuthToken('token_123');
    const router = createAppRouter(createMemoryHistory());
    const push = vi.spyOn(router, 'push');
    const wrapper = mount(TaskSubmitPage, {
      global: { plugins: [router] },
    });

    const file = new File(['image'], 'evidence.png', { type: 'image/png' });
    await wrapper.get('textarea[aria-label="完成说明"]').setValue('完成第 1 阶段任务');
    const fileInput = wrapper.get('input[aria-label="上传图片"]');
    Object.defineProperty(fileInput.element, 'files', {
      value: [file],
    });
    await fileInput.trigger('change');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(push).toHaveBeenCalledWith('/submissions/s1/result');
  });

  it('结果页应展示分数与缺失项', async () => {
    setAuthToken('token_123');
    const router = createAppRouter(createMemoryHistory());
    await router.push({
      path: '/submissions/s1/result',
      query: {
        status: 'needs_retry',
        totalScore: '72',
        riskScore: '38',
        missingItems: '补充图片证据',
      },
    });
    await router.isReady();

    const wrapper = mount(SubmissionResultPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('状态：needs_retry');
    expect(wrapper.text()).toContain('分数：72');
    expect(wrapper.text()).toContain('缺失项：补充图片证据');
  });
});
