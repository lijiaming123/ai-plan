import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import PlanCreatePage from '../src/features/plans/PlanCreatePage.vue';
import { createAppRouter } from '../src/router';
import { clearAuthToken, setAuthTier, setAuthToken } from '../src/stores/auth';
import { setApiClient } from '../src/lib/api-client';

describe('PlanCreatePage', () => {
  const createPlanMock = vi.fn();
  const planAssistantMock = vi.fn();
  const parsePlanFileMock = vi.fn();

  beforeEach(() => {
    createPlanMock.mockReset();
    planAssistantMock.mockReset();
    parsePlanFileMock.mockReset();
    createPlanMock.mockResolvedValue({
      id: 'plan_1',
      goal: '三个月完成作品集',
      deadline: new Date().toISOString(),
      requirement: '',
      type: 'general',
    });
    planAssistantMock.mockImplementation(async (input: { mode: 'draft' | 'chat'; goal: string; requirement: string; message?: string }) => {
      if (input.mode === 'draft') {
        return {
          reply: '已生成初稿',
          suggestedContent: `目标：${input.goal}\n建议执行结构：\n- 阶段一\n- 阶段二`,
        };
      }
      return {
        reply: '已根据你的补充更新建议',
        suggestedContent: `${input.requirement}\n\n用户补充：${input.message ?? ''}`,
      };
    });
    parsePlanFileMock.mockResolvedValue({
      text: '从文件解析出的计划内容',
    });

    clearAuthToken();
    setAuthTier('basic');
    setApiClient({
      login: vi.fn(),
      createPlan: createPlanMock,
      createSubmission: vi.fn(),
      planAssistant: planAssistantMock,
      parsePlanFile: parsePlanFileMock,
      getPlan: vi.fn(),
      regeneratePlan: vi.fn(),
      confirmPlan: vi.fn(),
      comparePlanVersions: vi.fn(),
    });
  });

  it('提交创建计划表单后应跳转到详情页', async () => {
    setAuthToken('token_123');
    const router = createAppRouter(createMemoryHistory());
    const push = vi.spyOn(router, 'push');
    const wrapper = mount(PlanCreatePage, {
      global: { plugins: [router] },
    });

    await wrapper.get('input[aria-label="计划名称"]').setValue('三个月完成作品集');
    await wrapper.get('textarea[aria-label="计划内容"]').setValue('12周内完成前端作品集并达到可投递标准');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(createPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: '三个月完成作品集',
        requirement: expect.any(String),
        token: 'token_123',
        type: 'general',
        profile: expect.objectContaining({
          planMode: 'basic',
          basicInfo: expect.objectContaining({
            planName: '三个月完成作品集',
            planContent: expect.any(String),
            cycle: '1m',
            currentLevel: 'none',
            outputMode: 'daily',
          }),
        }),
      })
    );
    expect(push).toHaveBeenCalled();
  });

  it('未登录访问计划页时应跳转到登录页', async () => {
    const router = createAppRouter(createMemoryHistory());

    await router.push('/plans/new');
    await router.isReady();

    expect(router.currentRoute.value.fullPath).toBe('/auth/login');
  });

  it('普通版默认不展示专业版能力内容区域', async () => {
    setAuthToken('token_123');
    const router = createAppRouter(createMemoryHistory());
    const wrapper = mount(PlanCreatePage, {
      global: { plugins: [router] },
    });
    expect(wrapper.find('[data-testid="pro-capability-panel"]').exists()).toBe(false);
  });

  it('专业版用户进入页面应默认激活专业版tab', async () => {
    setAuthToken('token_123');
    setAuthTier('pro');
    const router = createAppRouter(createMemoryHistory());
    await router.push('/plans/new');
    await router.isReady();
    const wrapper = mount(PlanCreatePage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const proTab = wrapper.get('[data-testid="tier-tab-pro"]');
    expect(proTab.classes()).toContain('bg-white');
    expect(wrapper.text()).toContain('当前为专业版创建计划');
  });

  it('普通版用户访问mode=pro时应回退到basic并同步URL', async () => {
    setAuthToken('token_123');
    setAuthTier('basic');
    const router = createAppRouter(createMemoryHistory());
    await router.push('/plans/new?mode=pro');
    await router.isReady();

    mount(PlanCreatePage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(router.currentRoute.value.query.mode).toBe('basic');
  });

  it('选择自定义周期时应展示计划完成时间', async () => {
    setAuthToken('token_123');
    const router = createAppRouter(createMemoryHistory());
    const wrapper = mount(PlanCreatePage, {
      global: { plugins: [router] },
    });

    await wrapper.get('select[aria-label="计划周期"]').setValue('custom');
    await flushPromises();

    expect(wrapper.find('[data-testid="custom-end-date"]').exists()).toBe(true);
  });

  it('专业版提交时应携带专业能力配置', async () => {
    setAuthToken('token_123');
    setAuthTier('pro');
    const router = createAppRouter(createMemoryHistory());
    const wrapper = mount(PlanCreatePage, {
      global: { plugins: [router] },
    });

    await wrapper.get('[data-testid="tier-tab-pro"]').trigger('click');
    await wrapper.get('input[aria-label="计划名称"]').setValue('提升英语口语');
    await wrapper.get('textarea[aria-label="计划内容"]').setValue('3个月提升到可流畅表达日常和工作场景');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(createPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          planMode: 'pro',
          proSettings: expect.objectContaining({
            aiDepth: 'basic',
            reminderMode: 'standard',
          }),
        }),
      })
    );
  });

  it('专业版点击AI生成初稿后应填充计划内容', async () => {
    setAuthToken('token_123');
    setAuthTier('pro');
    const router = createAppRouter(createMemoryHistory());
    await router.push('/plans/new');
    await router.isReady();
    const wrapper = mount(PlanCreatePage, {
      global: { plugins: [router] },
    });

    await wrapper.get('[data-testid="tier-tab-pro"]').trigger('click');
    await wrapper.get('input[aria-label="计划名称"]').setValue('英语口语冲刺');
    await wrapper.get('[data-testid="ai-generate-draft"]').trigger('click');
    await flushPromises();

    const content = (wrapper.get('textarea[aria-label="计划内容"]').element as HTMLTextAreaElement).value;
    expect(content).toContain('目标：英语口语冲刺');
    expect(planAssistantMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'draft',
        requirement: expect.stringContaining('你是一名资深 AI 计划顾问与执行教练'),
      })
    );
  });

  it('专业版对话支持Enter发送并可应用AI建议', async () => {
    setAuthToken('token_123');
    setAuthTier('pro');
    const router = createAppRouter(createMemoryHistory());
    await router.push('/plans/new');
    await router.isReady();
    const wrapper = mount(PlanCreatePage, {
      global: { plugins: [router] },
    });

    await wrapper.get('[data-testid="tier-tab-pro"]').trigger('click');
    await wrapper.get('input[aria-label="计划名称"]').setValue('英语口语冲刺');
    await wrapper.get('textarea[aria-label="与AI对话完善计划"]').setValue('请拆成每周任务');
    await wrapper.get('textarea[aria-label="与AI对话完善计划"]').trigger('keydown', { key: 'Enter', shiftKey: false });
    await flushPromises();

    expect(planAssistantMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'chat',
        message: '请拆成每周任务',
      })
    );

    await wrapper.findAll('button').find((btn) => btn.text().includes('应用到计划内容'))?.trigger('click');
    await flushPromises();
    const content = (wrapper.get('textarea[aria-label="计划内容"]').element as HTMLTextAreaElement).value;
    expect(content).toContain('用户补充：请拆成每周任务');
  });

  it('专业版上传txt文件后应自动填充计划内容', async () => {
    setAuthToken('token_123');
    setAuthTier('pro');
    const router = createAppRouter(createMemoryHistory());
    await router.push('/plans/new');
    await router.isReady();
    const wrapper = mount(PlanCreatePage, {
      global: { plugins: [router] },
    });

    await wrapper.get('[data-testid="tier-tab-pro"]').trigger('click');
    const file = {
      name: 'plan.txt',
      text: vi.fn().mockResolvedValue('这是一个文本计划内容'),
    } as unknown as File;
    const fileInput = wrapper.get('input[aria-label="计划文件上传"]');
    Object.defineProperty(fileInput.element, 'files', {
      value: [file],
    });
    await fileInput.trigger('change');
    await flushPromises();

    const content = (wrapper.get('textarea[aria-label="计划内容"]').element as HTMLTextAreaElement).value;
    expect(content).toContain('这是一个文本计划内容');
  });

  it('点击立即生成计划时应携带自动生成prompt提交后端', async () => {
    setAuthToken('token_123');
    setAuthTier('pro');
    const router = createAppRouter(createMemoryHistory());
    await router.push('/plans/new');
    await router.isReady();
    const wrapper = mount(PlanCreatePage, {
      global: { plugins: [router] },
    });

    await wrapper.get('[data-testid="tier-tab-pro"]').trigger('click');
    await wrapper.get('input[aria-label="计划名称"]').setValue('工作项目推进');
    await wrapper.get('textarea[aria-label="计划内容"]').setValue('完成季度目标与里程碑交付');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(planAssistantMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'draft',
        requirement: expect.stringContaining('你是一名资深 AI 计划顾问与执行教练'),
      })
    );
    expect(createPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requirement: expect.stringContaining('建议执行结构'),
      })
    );
  });

  it('新协议创建失败时应降级为老协议重试', async () => {
    setAuthToken('token_123');
    const router = createAppRouter(createMemoryHistory());
    createPlanMock.mockReset();
    createPlanMock
      .mockRejectedValueOnce(new Error('Request failed: 400'))
      .mockResolvedValueOnce({
        id: 'plan_fallback',
        goal: '前端',
        deadline: new Date().toISOString(),
        requirement: '内容',
        type: 'general',
      });

    const wrapper = mount(PlanCreatePage, {
      global: { plugins: [router] },
    });
    await wrapper.get('input[aria-label="计划名称"]').setValue('前端');
    await wrapper.get('textarea[aria-label="计划内容"]').setValue('内容');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(createPlanMock).toHaveBeenCalledTimes(2);
    expect(createPlanMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ profile: expect.any(Object) }));
    expect(createPlanMock.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        goal: '前端',
        requirement: expect.any(String),
      })
    );
    expect(createPlanMock.mock.calls[1]?.[0]).not.toHaveProperty('profile');
  });

  it('接口失败时应显示右上角可关闭错误提示', async () => {
    setAuthToken('token_123');
    const router = createAppRouter(createMemoryHistory());
    createPlanMock.mockReset();
    createPlanMock
      .mockRejectedValueOnce(new Error('Request failed: 400 - first'))
      .mockRejectedValueOnce(new Error('Request failed: 400 - second'));

    const wrapper = mount(PlanCreatePage, {
      global: { plugins: [router] },
    });
    await wrapper.get('input[aria-label="计划名称"]').setValue('前端');
    await wrapper.get('textarea[aria-label="计划内容"]').setValue('内容');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[data-testid="error-toast"]').text()).toContain('Request failed: 400');
    await wrapper.get('button[aria-label="关闭错误提示"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="error-toast"]').exists()).toBe(false);
  });
});
