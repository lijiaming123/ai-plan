import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ElSelect } from 'element-plus';
import type { VueWrapper } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
const { trackEventMock, trackPageViewMock } = vi.hoisted(() => ({
  trackEventMock: vi.fn(),
  trackPageViewMock: vi.fn(),
}));

vi.mock('../src/lib/telemetry', () => ({
  trackEvent: trackEventMock,
  trackPageView: trackPageViewMock,
}));

import PlanCreatePage from '../src/features/plans/PlanCreatePage.vue';
import { createAppRouter } from '../src/router';
import { clearAuthToken, setAuthTier, setAuthToken } from '../src/stores/auth';
import { createApiClient, setApiClient } from '../src/lib/api-client';

async function setPlanSelect(wrapper: VueWrapper, testId: string, value: string) {
  const root = wrapper.get(`[data-testid="${testId}"]`);
  const select = root.findComponent(ElSelect);
  expect(select.exists()).toBe(true);
  await select.vm.$emit('update:modelValue', value);
  await flushPromises();
}

describe('PlanCreatePage', () => {
  const createPlanMock = vi.fn();
  const planAssistantMock = vi.fn();
  const parsePlanFileMock = vi.fn();
  const getPlanMock = vi.fn();

  beforeEach(() => {
    createPlanMock.mockReset();
    planAssistantMock.mockReset();
    parsePlanFileMock.mockReset();
    getPlanMock.mockReset();
    getPlanMock.mockRejectedValue(new Error('getPlan not mocked'));
    trackEventMock.mockReset();
    trackPageViewMock.mockReset();
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
    sessionStorage.clear();
    const noopFetch = vi.fn(() =>
      Promise.reject(new Error('unexpected fetch')),
    ) as unknown as typeof fetch;
    setApiClient({
      ...createApiClient({ baseURL: 'http://test.local', fetchImpl: noopFetch }),
      createPlan: createPlanMock,
      planAssistant: planAssistantMock,
      parsePlanFile: parsePlanFileMock,
      getPlan: getPlanMock,
    });
  });

  it('提交创建计划表单后应跳转到草稿页', async () => {
    setAuthToken('token_123');
    const router = createAppRouter(createMemoryHistory());
    const push = vi.spyOn(router, 'push');
    const wrapper = mount(PlanCreatePage, {
      global: { plugins: [router] },
    });

    await wrapper.get('input[aria-label="计划名称"]').setValue('三个月完成作品集');
    await wrapper.get('textarea[aria-label="计划内容"]').setValue('12周内完成前端作品集并达到可投递标准');
    await setPlanSelect(wrapper, 'field-plan-scenario', 'study');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(createPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: '三个月完成作品集',
        requirement: '12周内完成前端作品集并达到可投递标准',
        token: 'token_123',
        type: 'study',
        profile: expect.objectContaining({
          planMode: 'basic',
          basicInfo: expect.objectContaining({
            planScenario: 'study',
            planName: '三个月完成作品集',
            planContent: '12周内完成前端作品集并达到可投递标准',
            cycle: '1m',
            currentLevel: 'none',
            startingPoint: '',
            granularityMode: 'smart',
          }),
        }),
      })
    );
    expect(push).toHaveBeenCalledWith({ name: 'plan-draft', params: { id: 'plan_1' } });
    expect(trackEventMock).toHaveBeenCalledWith('plan_create', {
      properties: {
        planId: 'plan_1',
        type: 'study',
        planScenario: 'study',
      },
    });
    const draftRaw = sessionStorage.getItem('ai-plan:draft-stream:plan_1');
    expect(draftRaw).toBeTruthy();
    expect(JSON.parse(draftRaw as string).createTier).toBe('basic');
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

    await setPlanSelect(wrapper, 'field-cycle', 'custom');
    await flushPromises();

    expect(wrapper.find('[data-testid="custom-end-date"]').exists()).toBe(true);
  });

  it('普通版提交应携带 granularityMode', async () => {
    setAuthToken('token_123');
    const router = createAppRouter(createMemoryHistory());
    const wrapper = mount(PlanCreatePage, {
      global: { plugins: [router] },
    });

    await wrapper.get('input[aria-label="计划名称"]').setValue('英语打卡');
    await wrapper.get('textarea[aria-label="计划内容"]').setValue('每天30分钟听说练习');
    await setPlanSelect(wrapper, 'field-plan-scenario', 'study');
    await setPlanSelect(wrapper, 'field-granularity', 'deep');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(createPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          basicInfo: expect.objectContaining({
            granularityMode: 'deep',
          }),
        }),
      })
    );
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
    await setPlanSelect(wrapper, 'field-plan-scenario', 'study');
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

  it('专业版点击生成初稿后初稿出现在助手区且不覆盖「计划内容」输入框', async () => {
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
    await wrapper.get('textarea[aria-label="计划内容"]').setValue('用户手写的目标说明');
    const before = (wrapper.get('textarea[aria-label="计划内容"]').element as HTMLTextAreaElement).value;
    await wrapper.get('[data-testid="ai-generate-draft"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('目标：英语口语冲刺');
    const after = (wrapper.get('textarea[aria-label="计划内容"]').element as HTMLTextAreaElement).value;
    expect(after).toBe(before);
    expect(planAssistantMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'draft',
        requirement: expect.stringContaining('你是一名资深 AI 计划顾问与执行教练'),
      })
    );
  });

  it('专业版先生成初稿但未确认优化时应禁止提交（B gate）', async () => {
    setAuthToken('token_123');
    setAuthTier('pro');

    planAssistantMock.mockResolvedValueOnce({
      reply: 'Pro已生成并优化',
      suggestedContent: '优化版内容',
      schedule: {
        granularity: 'week',
        slots: [
          {
            slotKey: 'W1',
            generatedContent: 'g',
            content: 'c',
            contentSource: 'generated',
          },
        ],
      },
      meta: {
        usedAgent: 'pro',
        score: 88,
        options: [{ id: 'more_steady', title: '更稳', pros: [], cons: [] }],
      },
    });

    const router = createAppRouter(createMemoryHistory());
    const wrapper = mount(PlanCreatePage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.get('input[aria-label="计划名称"]').setValue('提升英语口语');
    await wrapper.get('textarea[aria-label="计划内容"]').setValue('3个月提升到可流畅表达日常和工作场景');
    await setPlanSelect(wrapper, 'field-plan-scenario', 'study');

    await wrapper.get('[data-testid="ai-generate-draft"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="pro-agent-review"]').exists()).toBe(true);

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(createPlanMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('还差一步：请先在「计划助手」确认一次优化版本，再生成计划。');
  });

  it('专业版对话支持Enter发送并自动合并到助手草稿', async () => {
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
    await wrapper.get('textarea[aria-label="计划内容"]').setValue('原始说明');
    await wrapper.get('textarea[aria-label="对话完善计划"]').setValue('请拆成每周任务');
    await wrapper.get('textarea[aria-label="对话完善计划"]').trigger('keydown', { key: 'Enter', shiftKey: false });
    await flushPromises();

    expect(planAssistantMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'chat',
        message: '请拆成每周任务',
      })
    );

    expect(wrapper.text()).toContain('用户补充：请拆成每周任务');
    expect(wrapper.text()).not.toContain('应用到计划内容');
    const planField = (wrapper.get('textarea[aria-label="计划内容"]').element as HTMLTextAreaElement).value;
    expect(planField).toBe('原始说明');
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

  it('点击立即生成计划时应写入草稿流式载荷并不再阻塞 planAssistant', async () => {
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
    await setPlanSelect(wrapper, 'field-plan-scenario', 'travel');
    await flushPromises();
    await wrapper.get('input[aria-label="出发地"]').setValue('上海');
    await wrapper.get('input[aria-label="目的地"]').setValue('东京');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    // Pro：未点「生成初稿」直接提交时会先走一次 Pro Agent 自生成自优化（不阻塞草稿流式）
    expect(planAssistantMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'draft',
        tier: 'pro',
        agent: 'pro',
      }),
    );
    expect(createPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requirement: expect.stringMatching(/目标：工作项目推进/),
        type: 'travel',
      })
    );
    expect(createPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requirement: expect.stringContaining('【用户自由补充】'),
      })
    );
    expect(createPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requirement: expect.stringContaining('完成季度目标与里程碑交付'),
      })
    );
    const ta = (wrapper.get('textarea[aria-label="计划内容"]').element as HTMLTextAreaElement).value;
    expect(ta).toBe('完成季度目标与里程碑交付');
    const raw = sessionStorage.getItem('ai-plan:draft-stream:plan_1');
    expect(raw).toBeTruthy();
    const payload = JSON.parse(raw as string) as {
      assistantPrompt?: string;
      createTier?: string;
    };
    expect(payload.assistantPrompt).toContain('你是一名资深旅行规划师');
    expect(payload.createTier).toBe('pro');
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

    const push = vi.spyOn(router, 'push');
    const wrapper = mount(PlanCreatePage, {
      global: { plugins: [router] },
    });
    await wrapper.get('input[aria-label="计划名称"]').setValue('前端');
    await wrapper.get('textarea[aria-label="计划内容"]').setValue('内容');
    await setPlanSelect(wrapper, 'field-plan-scenario', 'study');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(createPlanMock).toHaveBeenCalledTimes(2);
    expect(createPlanMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ profile: expect.any(Object) }));
    expect(createPlanMock.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        goal: '前端',
        requirement: expect.any(String),
        type: 'study',
      })
    );
    expect(createPlanMock.mock.calls[1]?.[0]).not.toHaveProperty('profile');
    expect(push).toHaveBeenCalledWith({ name: 'plan-draft', params: { id: 'plan_fallback' } });
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
    await setPlanSelect(wrapper, 'field-plan-scenario', 'study');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[data-testid="error-toast"]').text()).toContain('提交的信息有点问题');
    await wrapper.get('button[aria-label="关闭错误提示"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="error-toast"]').exists()).toBe(false);
  });

  it('未选择计划场景时应阻止提交', async () => {
    setAuthToken('token_123');
    const router = createAppRouter(createMemoryHistory());
    const wrapper = mount(PlanCreatePage, {
      global: { plugins: [router] },
    });

    await wrapper.get('input[aria-label="计划名称"]').setValue('前端');
    await wrapper.get('textarea[aria-label="计划内容"]').setValue('内容');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(createPlanMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('请选择计划场景');
  });

  it('投入时间选择自定义时应携带自定义小时数', async () => {
    setAuthToken('token_123');
    const router = createAppRouter(createMemoryHistory());
    const wrapper = mount(PlanCreatePage, {
      global: { plugins: [router] },
    });

    await wrapper.get('input[aria-label="计划名称"]').setValue('数学强化');
    await wrapper.get('textarea[aria-label="计划内容"]').setValue('考研数学冲刺');
    await setPlanSelect(wrapper, 'field-plan-scenario', 'study');
    await setPlanSelect(wrapper, 'field-time-investment', 'custom');
    await wrapper.get('input[aria-label="自定义每周投入小时"]').setValue('12');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(createPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          basicInfo: expect.objectContaining({
            timeInvestment: 'custom:12h_weekly',
            timeInvestmentCustomHours: 12,
          }),
        }),
      })
    );
  });

  it('重点倾斜应支持tag添加删除并以数组提交', async () => {
    setAuthToken('token_123');
    const router = createAppRouter(createMemoryHistory());
    const wrapper = mount(PlanCreatePage, {
      global: { plugins: [router] },
    });

    await wrapper.get('input[aria-label="计划名称"]').setValue('考研冲刺');
    await wrapper.get('textarea[aria-label="计划内容"]').setValue('提升总分并补齐薄弱科目');
    await setPlanSelect(wrapper, 'field-plan-scenario', 'study');

    const tagInput = wrapper.get('input[aria-label="添加重点倾斜"]');
    await tagInput.setValue('数学');
    await tagInput.trigger('keydown', { key: 'Enter' });
    await tagInput.setValue('英语');
    await tagInput.trigger('keydown', { key: ',' });
    await flushPromises();

    expect(wrapper.text()).toContain('数学');
    expect(wrapper.text()).toContain('英语');

    await wrapper.get('button[aria-label="删除重点项-数学"]').trigger('click');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(createPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          basicInfo: expect.objectContaining({
            focusAreas: ['英语'],
          }),
        }),
      })
    );
  });

  it('重点倾斜最多允许8个标签', async () => {
    setAuthToken('token_123');
    const router = createAppRouter(createMemoryHistory());
    const wrapper = mount(PlanCreatePage, {
      global: { plugins: [router] },
    });

    await wrapper.get('input[aria-label="计划名称"]').setValue('考研冲刺');
    await wrapper.get('textarea[aria-label="计划内容"]').setValue('提升总分并补齐薄弱科目');
    await setPlanSelect(wrapper, 'field-plan-scenario', 'study');

    const tagInput = wrapper.get('input[aria-label="添加重点倾斜"]');
    const tags = ['数学', '英语', '政治', '专业课', '阅读', '写作', '听力', '口语', '逻辑'];
    for (const tag of tags) {
      await tagInput.setValue(tag);
      await tagInput.trigger('keydown', { key: 'Enter' });
    }
    await flushPromises();

    expect(wrapper.text()).toContain('最多添加8个重点项');
    expect(wrapper.text()).not.toContain('逻辑');

    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(createPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          basicInfo: expect.objectContaining({
            focusAreas: ['数学', '英语', '政治', '专业课', '阅读', '写作', '听力', '口语'],
          }),
        }),
      })
    );
  });

  it('continuationFrom 应预填名称与内容并在创建时携带 parentPlanId', async () => {
    setAuthToken('token_123');
    getPlanMock.mockResolvedValueOnce({
      id: 'parent_x',
      goal: '母计划标题',
      deadline: new Date().toISOString(),
      requirement: '旧正文',
      type: 'general',
      status: 'active',
      nextStep: '下一阶段只做精听',
    });

    const router = createAppRouter(createMemoryHistory());
    await router.push({
      path: '/plans/new',
      query: { continuationFrom: 'parent_x', mode: 'basic' },
    });
    await router.isReady();

    const wrapper = mount(PlanCreatePage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const nameEl = wrapper.get('input[aria-label="计划名称"]')
      .element as HTMLInputElement;
    expect(nameEl.value).toContain('母计划标题 · 下一步');

    await setPlanSelect(wrapper, 'field-plan-scenario', 'study');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(createPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: expect.stringContaining('母计划标题'),
        token: 'token_123',
        parentPlanId: 'parent_x',
        type: 'study',
      }),
    );
  });

  it('选择其它场景时应展示勾选打卡说明', async () => {
    setAuthToken('token_123');
    const router = createAppRouter(createMemoryHistory());
    await router.push({ path: '/plans/new', query: { mode: 'basic' } });
    await router.isReady();

    const wrapper = mount(PlanCreatePage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await setPlanSelect(wrapper, 'field-plan-scenario', 'other');
    await flushPromises();

    expect(wrapper.find('[data-testid="plan-scenario-other-checkin-hint"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('勾选完成');
    expect(wrapper.text()).toContain('不需要');
  });

  it('模板模块关闭时应展示官方示例并预填表单', async () => {
    vi.stubEnv('VITE_FEATURE_TEMPLATES', 'false');
    const listPresets = vi.fn().mockResolvedValue({
      items: [
        {
          id: 'pr1',
          slug: 'preset-study',
          title: '备考冲刺',
          summary: '示例',
          coverImageUrl: null,
          category: 'study',
          tags: ['学习'],
          locale: 'zh-CN',
          sortOrder: 0,
        },
      ],
    });
    const getPresetTemplateDetail = vi.fn().mockResolvedValue({
      id: 'pr1',
      authorId: 'system',
      authorName: '系统预设',
      title: '备考冲刺',
      summary: '示例',
      category: 'study',
      tags: ['学习'],
      likeCount: 0,
      applicationCount: 0,
      publishedAt: null,
      preview: {
        goal: '12周备考',
        deadline: '2026-12-31T00:00:00.000Z',
        requirementExcerpt: '每日学习 2 小时',
        type: 'study',
        granularityMode: 'smart',
        startDateIso: null,
        versionId: 'preset:pr1',
        version: 1,
        payloadHash: 'preset:v1',
      },
    });
    setApiClient({
      ...createApiClient({ baseURL: 'http://test.local', fetchImpl: vi.fn() as unknown as typeof fetch }),
      createPlan: createPlanMock,
      planAssistant: planAssistantMock,
      parsePlanFile: parsePlanFileMock,
      getPlan: getPlanMock,
      listPresets,
      getPresetTemplateDetail,
      getPlanAssistantContext: vi.fn().mockResolvedValue({
        pinnedNotes: [],
        recentSummaryInject: null,
      }),
    });
    setAuthToken('token_123');
    const router = createAppRouter(createMemoryHistory());
    await router.push({ path: '/plans/new', query: { mode: 'basic' } });
    await router.isReady();

    const wrapper = mount(PlanCreatePage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('[data-testid="create-preset-strip"]').exists()).toBe(true);
    await wrapper.get('[data-testid="create-preset-pr1"]').trigger('click');
    await flushPromises();

    const nameEl = wrapper.get('input[aria-label="计划名称"]').element as HTMLInputElement;
    expect(nameEl.value).toBe('12周备考');
    expect(getPresetTemplateDetail).toHaveBeenCalledWith({ id: 'pr1' });
    vi.unstubAllEnvs();
  });
});
