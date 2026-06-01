import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import TaskSubmitPage from '../src/features/submissions/TaskSubmitPage.vue';
import SubmissionResultPage from '../src/features/submissions/SubmissionResultPage.vue';
import { createAppRouter } from '../src/router';
import { clearAuthToken, setAuthToken } from '../src/stores/auth';
import { createApiClient, setApiClient } from '../src/lib/api-client';

describe('submission flow', () => {
  const createSubmissionMock = vi.fn();
  const uploadUserFileMock = vi.fn();

  beforeEach(() => {
    clearAuthToken();
    createSubmissionMock.mockReset();
    uploadUserFileMock.mockReset();
    createSubmissionMock.mockResolvedValue({
      id: 's1',
      content: '完成第 1 阶段任务',
      images: [{ id: 'img_1', url: 'https://api.test/files/u1.png', hash: 'hash_1' }],
    });
    uploadUserFileMock.mockResolvedValue({
      path: '/files/u1.png',
      url: 'https://api.test/files/u1.png',
      fileName: 'evidence.png',
      kind: 'image',
    });
    setApiClient({
      ...createApiClient(),
      createSubmission: createSubmissionMock,
      uploadUserFile: uploadUserFileMock,
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
    const fileInput = wrapper.get('input[aria-label="上传附件"]');
    Object.defineProperty(fileInput.element, 'files', {
      value: [file],
    });
    await fileInput.trigger('change');
    await flushPromises();
    expect(uploadUserFileMock).toHaveBeenCalled();
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(push).toHaveBeenCalledWith('/submissions/s1/result');
  });

  it('提交失败时应展示可关闭错误提示', async () => {
    setAuthToken('token_123');
    createSubmissionMock.mockRejectedValueOnce(new Error('Request failed: 400 - bad payload'));
    const router = createAppRouter(createMemoryHistory());
    const push = vi.spyOn(router, 'push');
    const wrapper = mount(TaskSubmitPage, {
      global: { plugins: [router] },
    });

    await wrapper.get('textarea[aria-label="完成说明"]').setValue('完成第 1 阶段任务');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[data-testid="error-toast"]').text()).toContain('提交的信息有点问题');
    await wrapper.get('button[aria-label="关闭错误提示"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="error-toast"]').exists()).toBe(false);
    expect(push).not.toHaveBeenCalled();
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
