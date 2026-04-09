<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElDatePicker } from 'element-plus';
import { getApiClient } from '../../lib/api-client';
import { authState } from '../../stores/auth';
import UiErrorToast from '../../components/UiErrorToast.vue';

type PlanMode = 'basic' | 'pro';
type CycleValue = '1w' | '1m' | '3m' | '6m' | 'custom';
type CurrentLevel = 'none' | 'newbie' | 'junior' | 'intermediate' | 'advanced';
type OutputMode = 'daily' | 'phase-weekly' | 'phase-monthly';
type ReminderMode = 'standard' | 'smart';
type AiDepth = 'basic' | 'advanced';
type ChatRole = 'assistant' | 'user';

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  suggestedContent?: string;
};

const router = useRouter();
const route = useRoute();

function formatDate(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function addDays(base: string, days: number) {
  const date = parseDate(base);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function addMonths(base: string, months: number) {
  const date = parseDate(base);
  date.setMonth(date.getMonth() + months);
  return formatDate(date);
}

function computeDeadlineByCycle(startDate: string, cycle: CycleValue) {
  if (cycle === '1w') return addDays(startDate, 7);
  if (cycle === '1m') return addMonths(startDate, 1);
  if (cycle === '3m') return addMonths(startDate, 3);
  if (cycle === '6m') return addMonths(startDate, 6);
  return '';
}

function toIsoStartOfDay(dateStr: string) {
  return `${dateStr}T00:00:00.000Z`;
}

const today = formatDate(new Date());
const isSubmitting = ref(false);
const showUpgradeHint = ref(false);
const planTierMode = ref<PlanMode>('basic');
const isProMode = computed(() => planTierMode.value === 'pro');
const uploadedPlanFileName = ref('');
const uploadedFileHint = ref('');
const chatInput = ref('');
const isAiThinking = ref(false);
const errorToastMessage = ref('');
const chatMessages = ref<ChatMessage[]>([
  {
    id: 'chat-init',
    role: 'assistant',
    content: '你好，我是你的计划助手。填写上面的基础信息后，点击“AI生成初稿”，我会先给你一版初始计划，然后我们再对话优化。',
  },
]);

const form = reactive({
  goal: '',
  requirement: '',
  currentLevel: 'none' as CurrentLevel,
  startDate: today,
  cycle: '1m' as CycleValue,
  customEndDate: '',
  preference: '',
  timeInvestment: 'none',
  outputMode: 'daily' as OutputMode,
  reminderMode: 'standard' as ReminderMode,
  aiDepth: 'basic' as AiDepth,
});

const errors = reactive({
  goal: '',
  requirement: '',
  startDate: '',
  customEndDate: '',
});

const cycleOptions = [
  { label: '1周', value: '1w' },
  { label: '1个月', value: '1m' },
  { label: '3个月', value: '3m' },
  { label: '半年', value: '6m' },
  { label: '自定义', value: 'custom' },
] as const;

const effectiveDeadline = computed(() => {
  if (form.cycle === 'custom') return form.customEndDate;
  return computeDeadlineByCycle(form.startDate, form.cycle);
});

const acceptedPlanFileTypes = ['txt', 'md', 'markdown', 'doc', 'docx'] as const;

function closeErrorToast() {
  errorToastMessage.value = '';
}

function showErrorToast(message: string) {
  errorToastMessage.value = message;
}

function extractErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function getCycleLabel(cycle: CycleValue) {
  const cycleLabelMap: Record<CycleValue, string> = {
    '1w': '1周',
    '1m': '1个月',
    '3m': '3个月',
    '6m': '半年',
    custom: '自定义',
  };
  return cycleLabelMap[cycle];
}

const generatedPrompt = computed(() => {
  const endDateText = effectiveDeadline.value || form.startDate || today;
  const contextLines = [
    `- 目标名称：${form.goal || '（待补充）'}`,
    `- 目标说明：${form.requirement || '（待补充）'}`,
    `- 计划开始时间：${form.startDate || today}`,
    `- 计划周期：${getCycleLabel(form.cycle)}（预计完成：${endDateText}）`,
  ];
  if (form.currentLevel !== 'none') contextLines.push(`- 当前水平：${form.currentLevel}`);
  if (form.preference.trim()) contextLines.push(`- 偏好与限制：${form.preference.trim()}`);
  if (form.timeInvestment !== 'none') contextLines.push(`- 可投入时间：${form.timeInvestment}`);
  contextLines.push(`- 输出形式偏好：${form.outputMode}`);

  return `你是一名资深 AI 计划顾问与执行教练。

请基于以下用户基础信息，生成一份高可执行、可跟踪、可复盘的计划方案。该请求可能属于学习、工作、项目推进、健康管理或其他个人成长目标，请先判断最可能的场景，再输出计划。

【用户基础信息】
${contextLines.join('\n')}

【输出要求】
1. 先给出你判断的场景类型（学习/工作/项目/健康/生活/其他）与判断依据
2. 生成阶段化计划（按周期拆分），每个阶段提供明确目标与验收标准
3. 给出可执行任务清单（优先具体到周，必要时细化到天）
4. 提供风险点与应对策略（至少3条）
5. 提供复盘建议与下一步迭代方向

【风格要求】
- 内容要务实、可执行，不空泛
- 优先工程化表达：步骤清晰、可检查、可落地
- 如果用户信息不足，请在结尾列出“还需要补充的信息”

请直接输出最终计划内容。`;
});

function normalizeMode(raw: unknown): PlanMode {
  const requested = raw === 'pro' || raw === 'basic' ? raw : null;
  if (requested === 'pro' && authState.tier !== 'pro') return 'basic';
  if (requested === 'basic') return 'basic';
  return authState.tier === 'pro' ? 'pro' : 'basic';
}

function syncModeFromRoute() {
  const normalized = normalizeMode(route.query.mode);
  if (planTierMode.value !== normalized) {
    planTierMode.value = normalized;
  }

  if (route.query.mode !== normalized) {
    router.replace({
      query: {
        ...route.query,
        mode: normalized,
      },
    });
  }
}

function validateForm() {
  errors.goal = form.goal.trim() ? '' : '请输入计划名称';
  errors.requirement = form.requirement.trim() ? '' : '请输入计划内容';
  errors.startDate = form.startDate ? '' : '请选择计划开始时间';
  errors.customEndDate = form.cycle === 'custom' && !form.customEndDate ? '请选择计划完成时间' : '';
  return !errors.goal && !errors.requirement && !errors.startDate && !errors.customEndDate;
}

async function handleSubmit() {
  if (!validateForm()) return;
  isSubmitting.value = true;

  const client = getApiClient();
  let finalRequirement = form.requirement;
  if (typeof client.planAssistant === 'function') {
    try {
      const assistantResult = await client.planAssistant({
        token: authState.token,
        mode: 'draft',
        goal: form.goal,
        requirement: generatedPrompt.value,
        startDate: form.startDate,
        cycle: form.cycle,
        endDate: effectiveDeadline.value || form.startDate,
      });
      if (assistantResult.suggestedContent?.trim()) {
        finalRequirement = assistantResult.suggestedContent.trim();
        form.requirement = finalRequirement;
      }
    } catch (error) {
      showErrorToast(extractErrorMessage(error, 'AI初稿生成失败，已使用原始内容继续。'));
    }
  }

  const profile = {
    planMode: planTierMode.value,
    basicInfo: {
      planName: form.goal,
      planContent: finalRequirement,
      currentLevel: form.currentLevel,
      startDate: form.startDate,
      cycle: form.cycle,
      endDate: effectiveDeadline.value || form.startDate,
      preference: form.preference.trim(),
      timeInvestment: form.timeInvestment,
      outputMode: form.outputMode,
    },
    proSettings: isProMode.value
      ? {
          aiDepth: form.aiDepth,
          reminderMode: form.reminderMode,
        }
      : undefined,
  };

  const planPayloadDraft = {
    basic: {
      goal: form.goal,
      requirement: finalRequirement,
      startDate: form.startDate,
      cycle: form.cycle,
      deadline: effectiveDeadline.value,
      currentLevel: form.currentLevel,
      preference: form.preference,
      timeInvestment: form.timeInvestment,
      outputMode: form.outputMode,
    },
    advanced:
      isProMode.value
        ? {
            aiDepth: form.aiDepth,
            reminderMode: form.reminderMode,
          }
        : null,
  };
  void planPayloadDraft;

  const deadline = toIsoStartOfDay(effectiveDeadline.value || form.startDate);
  let plan;
  try {
    plan = await client.createPlan({
      goal: form.goal,
      deadline,
      requirement: finalRequirement,
      type: 'general',
      token: authState.token,
      profile,
    });
  } catch (error) {
    showErrorToast(extractErrorMessage(error, '计划创建失败，正在尝试兼容模式重试。'));
    // Backward compatibility for older /plans contract.
    try {
      plan = await client.createPlan({
        goal: form.goal,
        deadline,
        requirement: finalRequirement,
        type: 'general',
        token: authState.token,
      });
    } catch (retryError) {
      showErrorToast(extractErrorMessage(retryError, '计划创建失败，请稍后重试。'));
      return;
    }
  } finally {
    isSubmitting.value = false;
  }

  await router.push({ name: 'plan-draft', params: { id: plan.id } });
}

function buildAiDraftContent() {
  const cycleLabel = getCycleLabel(form.cycle);
  const endDateText = effectiveDeadline.value || '待确认';
  return [
    `目标：${form.goal}`,
    `起始时间：${form.startDate}`,
    `计划周期：${cycleLabel}`,
    `预计完成：${endDateText}`,
    '',
    '建议执行结构：',
    '1. 启动阶段：明确里程碑与每周目标',
    '2. 执行阶段：按周推进并记录完成情况',
    '3. 收尾阶段：复盘结果并沉淀可复用方法',
    '',
    `补充说明：${form.requirement || '暂无，请继续补充细节。'}`,
  ].join('\n');
}

async function handleGenerateAiDraft() {
  if (!form.goal.trim()) {
    errors.goal = '请输入计划名称';
    return;
  }
  if (!form.startDate) {
    errors.startDate = '请选择计划开始时间';
    return;
  }
  isAiThinking.value = true;
  const client = getApiClient();
  try {
    const response =
      typeof client.planAssistant === 'function'
        ? await client.planAssistant({
            token: authState.token,
            mode: 'draft',
            goal: form.goal,
            requirement: generatedPrompt.value,
            startDate: form.startDate,
            cycle: form.cycle,
            endDate: effectiveDeadline.value || form.startDate,
          })
        : {
            reply: '已为你生成一版初稿，你可以继续让我按周/按天细化。',
            suggestedContent: buildAiDraftContent(),
          };

    form.requirement = response.suggestedContent;
    errors.requirement = '';
    chatMessages.value.push({
      id: `chat-draft-${Date.now()}`,
      role: 'assistant',
      content: response.reply,
      suggestedContent: response.suggestedContent,
    });
  } catch (error) {
    const draft = buildAiDraftContent();
    form.requirement = draft;
    showErrorToast(extractErrorMessage(error, 'AI 服务暂不可用，已使用本地策略生成初稿。'));
    chatMessages.value.push({
      id: `chat-draft-fallback-${Date.now()}`,
      role: 'assistant',
      content: 'AI 服务暂不可用，已使用本地策略为你生成初稿。',
      suggestedContent: draft,
    });
  } finally {
    isAiThinking.value = false;
  }
}

async function handleChatSend() {
  const content = chatInput.value.trim();
  if (!content) return;
  chatMessages.value.push({
    id: `chat-user-${Date.now()}`,
    role: 'user',
    content,
  });
  chatInput.value = '';
  isAiThinking.value = true;
  const client = getApiClient();
  try {
    const response =
      typeof client.planAssistant === 'function'
        ? await client.planAssistant({
            token: authState.token,
            mode: 'chat',
            goal: form.goal || '未命名计划',
            requirement: form.requirement,
            startDate: form.startDate || today,
            cycle: form.cycle,
            endDate: effectiveDeadline.value || form.startDate || today,
            message: content,
          })
        : {
            reply: '已收到补充，我给你整合了一版新内容。',
            suggestedContent: form.requirement.trim() ? `${form.requirement.trim()}\n\n用户补充：${content}` : content,
          };

    chatMessages.value.push({
      id: `chat-ai-${Date.now()}`,
      role: 'assistant',
      content: response.reply,
      suggestedContent: response.suggestedContent,
    });
  } catch (error) {
    const mergedRequirement = form.requirement.trim()
      ? `${form.requirement.trim()}\n\n用户补充：${content}`
      : content;
    showErrorToast(extractErrorMessage(error, 'AI 对话服务暂不可用，已先按本地策略合并内容。'));
    chatMessages.value.push({
      id: `chat-ai-fallback-${Date.now()}`,
      role: 'assistant',
      content: 'AI 服务暂不可用，已先把你的补充整合为新草稿。',
      suggestedContent: mergedRequirement,
    });
  } finally {
    isAiThinking.value = false;
  }
}

function applyAssistantSuggestion(message: ChatMessage) {
  if (!message.suggestedContent) return;
  form.requirement = message.suggestedContent;
  errors.requirement = '';
}

function handleChatInputKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    void handleChatSend();
  }
}

function getFileExtension(name: string) {
  const index = name.lastIndexOf('.');
  if (index < 0) return '';
  return name.slice(index + 1).toLowerCase();
}

async function readTextFromFile(file: File) {
  if (typeof file.text === 'function') {
    return await file.text();
  }
  const buffer = await file.arrayBuffer();
  return new TextDecoder().decode(buffer);
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function handlePlanFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const extension = getFileExtension(file.name);
  if (!acceptedPlanFileTypes.includes(extension as (typeof acceptedPlanFileTypes)[number])) {
    uploadedPlanFileName.value = '';
    uploadedFileHint.value = '文件格式不支持，请上传 txt / md / doc / docx 文件。';
    input.value = '';
    return;
  }

  uploadedPlanFileName.value = file.name;
  uploadedFileHint.value = `已上传：${file.name}`;
  if (extension === 'txt' || extension === 'md' || extension === 'markdown') {
    const text = (await readTextFromFile(file)).trim();
    if (text) {
      form.requirement = text;
      errors.requirement = '';
      uploadedFileHint.value = `已上传并填充内容：${file.name}`;
    }
    return;
  }

  try {
    uploadedFileHint.value = `已上传：${file.name}，正在解析内容...`;
    const base64 = await fileToBase64(file);
    const client = getApiClient();
    if (typeof client.parsePlanFile !== 'function') {
      uploadedFileHint.value = `已上传：${file.name}（当前环境暂不支持解析该格式）`;
      return;
    }
    const parsed = await client.parsePlanFile({
      token: authState.token,
      fileName: file.name,
      contentBase64: base64,
    });
    if (parsed.text.trim()) {
      form.requirement = parsed.text.trim();
      errors.requirement = '';
      uploadedFileHint.value = `已上传并填充内容：${file.name}`;
      return;
    }
    uploadedFileHint.value = `已上传：${file.name}，但未解析到可用文本。`;
  } catch (error) {
    showErrorToast(extractErrorMessage(error, '文件解析失败，请手动补充计划内容。'));
    uploadedFileHint.value = `已上传：${file.name}，解析失败，请手动补充计划内容。`;
  }
}

function switchTierMode(mode: PlanMode) {
  if (mode === 'pro' && authState.tier !== 'pro') {
    showUpgradeHint.value = true;
    return;
  }
  planTierMode.value = mode;
  router.replace({
    query: {
      ...route.query,
      mode,
    },
  });
}

async function goBack() {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  await router.push('/plans');
}

function disableBeforeToday(date: Date) {
  return date.getTime() < parseDate(today).getTime();
}

function disableBeforeStartDate(date: Date) {
  return date.getTime() < parseDate(form.startDate).getTime();
}

watch(
  () => [form.startDate, form.cycle] as const,
  () => {
    if (form.cycle !== 'custom') {
      form.customEndDate = '';
    }
  }
);

onMounted(syncModeFromRoute);
watch(
  () => route.query.mode,
  () => {
    syncModeFromRoute();
  }
);
watch(
  () => authState.tier,
  () => {
    syncModeFromRoute();
  }
);

</script>

<template>
  <div class="relative min-h-screen overflow-x-hidden bg-[#f3f7f4] font-display text-[#111813]">
    <UiErrorToast :message="errorToastMessage" @close="closeErrorToast" />

    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="bg-grid absolute inset-0"></div>
      <div class="bg-orb bg-orb-left"></div>
      <div class="bg-orb bg-orb-right"></div>
      <div class="bg-orb bg-orb-bottom"></div>
    </div>

    <header class="relative z-10 flex items-center justify-between border-b border-black/10 px-6 py-3 sm:px-10">
      <div class="flex items-center gap-4">
        <div class="size-6">
          <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 6H42L36 24L42 42H6L12 24L6 6Z" fill="currentColor" />
          </svg>
        </div>
        <h2 class="text-lg font-bold leading-tight tracking-[-0.015em]">计划大师</h2>
      </div>
      <router-link to="/plans" class="text-sm font-medium">我的计划</router-link>
    </header>

    <main class="relative z-10 px-4 py-8 sm:px-6 lg:px-8">
      <button type="button" class="back-nav-btn back-nav-side" aria-label="返回上一页" @click="goBack">
        <span class="back-nav-icon" aria-hidden="true">←</span>
        <span class="back-nav-text">返回上一页</span>
      </button>

      <form class="mx-auto flex w-full max-w-5xl flex-col gap-6" @submit.prevent="handleSubmit">
        <div class="rounded-2xl border border-[#e6ebe8] bg-white p-5 shadow-sm">
          <div class="mb-4 flex">
            <div class="inline-flex rounded-full bg-[#f1f3f2] p-1" role="tablist" aria-label="创建计划版本">
              <button
                data-testid="tier-tab-basic"
                type="button"
                role="tab"
                class="rounded-full px-4 py-1.5 text-xs font-semibold transition"
                :class="!isProMode ? 'bg-white text-[#1f2a24] shadow-sm' : 'text-[#6a7771]'"
                @click="switchTierMode('basic')"
              >
                普通版
              </button>
              <button
                data-testid="tier-tab-pro"
                type="button"
                role="tab"
                class="rounded-full px-4 py-1.5 text-xs font-semibold transition"
                :class="isProMode ? 'bg-white text-[#1f2a24] shadow-sm' : 'text-[#6a7771]'"
                @click="switchTierMode('pro')"
              >
                专业版
              </button>
            </div>
          </div>
          <p class="text-4xl font-black leading-tight tracking-[-0.033em]">创建你的新计划</p>
          <p class="mt-2 text-sm text-[#64716b]">当前为{{ isProMode ? '专业版创建计划' : '普通版创建计划' }}。</p>
          <div class="mt-4 flex flex-wrap items-center gap-4 text-xs text-[#64716b]">
            <span class="inline-flex items-center gap-1.5"><span class="field-icon required">✦</span>必填</span>
            <span class="inline-flex items-center gap-1.5"><span class="field-icon optional">◌</span>非必填</span>
          </div>
          <div
            v-if="showUpgradeHint && authState.tier === 'basic'"
            data-testid="upgrade-hint"
            class="mt-4 rounded-lg border border-primary/35 bg-primary/10 px-3 py-2 text-xs font-semibold text-[#0b8d4a]"
          >
            当前为普通版，升级后可启用高级拆解与智能提醒策略。
          </div>
        </div>

        <div class="grid grid-cols-1 gap-6">
          <section v-if="!isProMode" class="rounded-2xl border border-[#e6ebe8] bg-white p-5 shadow-sm">
            <h3 class="mb-4 text-base font-bold text-[#26302b]">基础信息</h3>
            <div class="flex flex-col gap-5">
              <label class="flex flex-col">
                <p class="field-label"><span class="field-icon required">✦</span>计划名称</p>
                <input
                  v-model="form.goal"
                  aria-label="计划名称"
                  class="h-14 rounded-lg border border-[#dbe6df] bg-white p-[15px] text-base outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/50"
                  placeholder="例如，学习一门新语言"
                />
                <p v-if="errors.goal" class="mt-2 text-xs font-semibold text-[#cc4338]">{{ errors.goal }}</p>
              </label>

              <label class="flex flex-col">
                <p class="field-label"><span class="field-icon required">✦</span>计划内容</p>
                <textarea
                  v-model="form.requirement"
                  aria-label="计划内容"
                  class="min-h-36 rounded-lg border border-[#dbe6df] bg-white p-[15px] text-base outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/50"
                  placeholder="在这里描述你希望通过这个计划达成的具体成果..."
                />
                <p v-if="errors.requirement" class="mt-2 text-xs font-semibold text-[#cc4338]">{{ errors.requirement }}</p>
              </label>

              <label class="flex flex-col">
                <p class="field-label"><span class="field-icon optional">◌</span>当前水平</p>
                <select
                  v-model="form.currentLevel"
                  aria-label="当前水平"
                  class="h-12 rounded-lg border border-[#dbe6df] bg-white px-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/50"
                >
                  <option value="none">无</option>
                  <option value="newbie">新手</option>
                  <option value="junior">入门</option>
                  <option value="intermediate">进阶</option>
                  <option value="advanced">熟练</option>
                </select>
              </label>

              <label class="flex flex-col">
                <p class="field-label"><span class="field-icon required">✦</span>计划开始时间</p>
                <ElDatePicker
                  v-model="form.startDate"
                  type="date"
                  value-format="YYYY-MM-DD"
                  format="YYYY-MM-DD"
                  class="w-full"
                  :disabled-date="disableBeforeToday"
                  placeholder="请选择计划开始时间"
                />
                <p v-if="errors.startDate" class="mt-2 text-xs font-semibold text-[#cc4338]">{{ errors.startDate }}</p>
              </label>

              <label class="flex flex-col">
                <p class="field-label"><span class="field-icon required">✦</span>计划周期</p>
                <select
                  v-model="form.cycle"
                  aria-label="计划周期"
                  class="h-12 rounded-lg border border-[#dbe6df] bg-white px-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/50"
                >
                  <option v-for="option in cycleOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </label>

              <label v-if="form.cycle === 'custom'" class="flex flex-col" data-testid="custom-end-date">
                <p class="field-label"><span class="field-icon required">✦</span>计划完成时间</p>
                <ElDatePicker
                  v-model="form.customEndDate"
                  type="date"
                  value-format="YYYY-MM-DD"
                  format="YYYY-MM-DD"
                  class="w-full"
                  :disabled-date="disableBeforeStartDate"
                  placeholder="请选择计划完成时间"
                />
                <p v-if="errors.customEndDate" class="mt-2 text-xs font-semibold text-[#cc4338]">{{ errors.customEndDate }}</p>
              </label>

              <label class="flex flex-col">
                <p class="field-label"><span class="field-icon optional">◌</span>偏好</p>
                <textarea
                  v-model="form.preference"
                  class="min-h-24 rounded-lg border border-[#dbe6df] bg-white p-[15px] text-base outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/50"
                  placeholder="例如：工作日晚上学习，每周最多投入6小时"
                />
              </label>

              <label class="flex flex-col">
                <p class="field-label"><span class="field-icon optional">◌</span>投入时间</p>
                <select
                  v-model="form.timeInvestment"
                  aria-label="投入时间"
                  class="h-12 rounded-lg border border-[#dbe6df] bg-white px-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/50"
                >
                  <option value="none">无</option>
                  <option value="30m_daily">每天30分钟</option>
                  <option value="1h_daily">每天1小时</option>
                  <option value="5h_weekly">每周5小时</option>
                  <option value="10h_weekly">每周10小时</option>
                </select>
              </label>

              <label class="flex flex-col">
                <p class="field-label"><span class="field-icon required">✦</span>输出形式</p>
                <select
                  v-model="form.outputMode"
                  aria-label="输出形式"
                  class="h-12 rounded-lg border border-[#dbe6df] bg-white px-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/50"
                >
                  <option value="daily">精确到每天任务</option>
                  <option value="phase-weekly">分阶段（周）</option>
                  <option value="phase-monthly">分阶段（月）</option>
                </select>
              </label>

              <div class="rounded-xl border border-dashed border-[#d6e7dd] bg-[#f8fcfa] px-4 py-3 text-xs leading-5 text-[#5f6d66]">
                预计完成时间：<span class="font-semibold text-[#1f2d27]">{{ effectiveDeadline || '待选择' }}</span>
              </div>
            </div>
          </section>

          <section v-else class="space-y-6" data-testid="pro-capability-panel">
            <div class="rounded-2xl border border-[#e6ebe8] bg-white p-5 shadow-sm">
              <h3 class="mb-4 text-base font-bold text-[#26302b]">专业版基础信息</h3>
              <div class="flex flex-col gap-5">
                <label class="flex flex-col">
                  <p class="field-label"><span class="field-icon required">✦</span>计划名称</p>
                  <input
                    v-model="form.goal"
                    aria-label="计划名称"
                    class="h-14 rounded-lg border border-[#dbe6df] bg-white p-[15px] text-base outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/50"
                    placeholder="例如，90天英语口语冲刺"
                  />
                  <p v-if="errors.goal" class="mt-2 text-xs font-semibold text-[#cc4338]">{{ errors.goal }}</p>
                </label>

                <label class="flex flex-col">
                  <p class="field-label"><span class="field-icon optional">◌</span>上传计划文件</p>
                  <input
                    type="file"
                    aria-label="计划文件上传"
                    accept=".txt,.md,.markdown,.doc,.docx"
                    class="h-11 rounded-lg border border-dashed border-[#cde2d6] bg-[#fafdfb] px-3 py-2 text-sm text-[#33433b]"
                    @change="handlePlanFileChange"
                  />
                  <p v-if="uploadedPlanFileName" class="mt-2 text-xs text-[#0f8b4e]">已选择：{{ uploadedPlanFileName }}</p>
                  <p v-if="uploadedFileHint" class="mt-1 text-xs text-[#64716b]">{{ uploadedFileHint }}</p>
                </label>

                <label class="flex flex-col">
                  <p class="field-label"><span class="field-icon required">✦</span>计划内容</p>
                  <textarea
                    v-model="form.requirement"
                    aria-label="计划内容"
                    class="min-h-36 rounded-lg border border-[#dbe6df] bg-white p-[15px] text-base outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/50"
                    placeholder="描述计划目标、边界、你希望 AI 协助细化的重点..."
                  />
                  <p v-if="errors.requirement" class="mt-2 text-xs font-semibold text-[#cc4338]">{{ errors.requirement }}</p>
                </label>

                <label class="flex flex-col">
                  <p class="field-label"><span class="field-icon required">✦</span>开始时间</p>
                  <ElDatePicker
                    v-model="form.startDate"
                    type="date"
                    value-format="YYYY-MM-DD"
                    format="YYYY-MM-DD"
                    class="w-full"
                    :disabled-date="disableBeforeToday"
                    placeholder="请选择计划开始时间"
                  />
                  <p v-if="errors.startDate" class="mt-2 text-xs font-semibold text-[#cc4338]">{{ errors.startDate }}</p>
                </label>

                <label class="flex flex-col">
                  <p class="field-label"><span class="field-icon required">✦</span>计划周期</p>
                  <select
                    v-model="form.cycle"
                    aria-label="计划周期"
                    class="h-12 rounded-lg border border-[#dbe6df] bg-white px-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/50"
                  >
                    <option v-for="option in cycleOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                  </select>
                </label>

                <label v-if="form.cycle === 'custom'" class="flex flex-col" data-testid="custom-end-date">
                  <p class="field-label"><span class="field-icon required">✦</span>计划完成时间</p>
                  <ElDatePicker
                    v-model="form.customEndDate"
                    type="date"
                    value-format="YYYY-MM-DD"
                    format="YYYY-MM-DD"
                    class="w-full"
                    :disabled-date="disableBeforeStartDate"
                    placeholder="请选择计划完成时间"
                  />
                  <p v-if="errors.customEndDate" class="mt-2 text-xs font-semibold text-[#cc4338]">{{ errors.customEndDate }}</p>
                </label>
              </div>
            </div>

            <div class="rounded-2xl border border-[#dce8e1] bg-white p-4 shadow-sm">
              <div class="mb-3 flex items-center justify-between">
                <h3 class="text-base font-bold text-[#26302b]">AI 计划共创</h3>
                <button
                  type="button"
                  data-testid="ai-generate-draft"
                  class="rounded-lg border border-[#cfe4d8] bg-[#f3faf6] px-3 py-1.5 text-xs font-semibold text-[#0f8b4e] transition hover:bg-[#e9f6ef]"
                  :disabled="isAiThinking"
                  @click="handleGenerateAiDraft"
                >
                  {{ isAiThinking ? '生成中...' : 'AI生成初稿' }}
                </button>
              </div>

              <div class="pro-chat-window mb-3">
                <div
                  v-for="message in chatMessages"
                  :key="message.id"
                  class="pro-chat-message"
                  :class="message.role === 'assistant' ? 'is-assistant' : 'is-user'"
                >
                  <p class="pro-chat-role">{{ message.role === 'assistant' ? 'AI' : '你' }}</p>
                  <p class="pro-chat-content">{{ message.content }}</p>
                  <div v-if="message.role === 'assistant' && message.suggestedContent" class="mt-2">
                    <button
                      type="button"
                      class="rounded-md border border-[#cfe4d8] bg-[#f3faf6] px-2.5 py-1 text-[11px] font-semibold text-[#0f8b4e] transition hover:bg-[#e7f5ee]"
                      @click="applyAssistantSuggestion(message)"
                    >
                      应用到计划内容
                    </button>
                  </div>
                </div>
                <div v-if="isAiThinking" class="pro-chat-thinking">
                  <span class="dot"></span>
                  <span class="dot"></span>
                  <span class="dot"></span>
                  <span class="ml-1">AI 正在思考...</span>
                </div>
              </div>

              <div class="rounded-xl border border-[#dbe6df] bg-[#fbfdfc] p-2">
                <textarea
                  v-model="chatInput"
                  rows="3"
                  aria-label="与AI对话完善计划"
                  class="w-full resize-none border-none bg-transparent px-2 py-1 text-sm outline-none"
                  placeholder="例如：请把执行阶段拆成每周目标，并加上每周复盘任务。"
                  @keydown="handleChatInputKeydown"
                />
                <div class="flex justify-end">
                  <button
                    type="button"
                    class="rounded-md bg-[#0f8b4e] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                    :disabled="isAiThinking || !chatInput.trim()"
                    @click="handleChatSend"
                  >
                    发送
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div class="mt-2 flex items-center justify-end gap-4 border-t border-black/10 p-4">
          <router-link to="/plans" class="flex h-12 items-center justify-center rounded-lg px-6 text-sm font-bold hover:bg-black/5">取消</router-link>
          <button
            class="flex h-12 min-w-[144px] items-center justify-center rounded-lg bg-primary px-6 text-sm font-bold text-[#111813] transition hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            :disabled="isSubmitting"
          >
            {{ isSubmitting ? '生成中...' : '立即生成计划' }}
          </button>
        </div>
      </form>
    </main>
  </div>
</template>

<style scoped>
.field-label {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding-bottom: 0.5rem;
  font-size: 1rem;
  font-weight: 500;
}

.field-icon {
  display: inline-flex;
  height: 1rem;
  width: 1rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 0.625rem;
  line-height: 1;
}

.field-icon.required {
  background: rgba(13, 143, 75, 0.16);
  color: #0d8f4b;
}

.field-icon.optional {
  background: rgba(98, 113, 107, 0.14);
  color: #62716b;
}

.bg-grid {
  background-image: linear-gradient(rgba(16, 84, 54, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(16, 84, 54, 0.06) 1px, transparent 1px);
  background-size: 44px 44px;
  opacity: 0.38;
}

.bg-orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(42px);
  opacity: 0.42;
}

.bg-orb-left {
  top: -90px;
  left: -60px;
  height: 260px;
  width: 260px;
  background: radial-gradient(circle at 30% 30%, rgba(53, 205, 117, 0.52), rgba(53, 205, 117, 0));
}

.bg-orb-right {
  top: 120px;
  right: -80px;
  height: 300px;
  width: 300px;
  background: radial-gradient(circle at 50% 50%, rgba(123, 208, 168, 0.46), rgba(123, 208, 168, 0));
}

.bg-orb-bottom {
  bottom: -120px;
  left: 20%;
  height: 280px;
  width: 420px;
  background: radial-gradient(circle at 50% 50%, rgba(185, 226, 206, 0.42), rgba(185, 226, 206, 0));
}

.back-nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 999px;
  border: 1px solid rgba(27, 111, 73, 0.2);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.88), rgba(241, 249, 245, 0.92));
  padding: 0.36rem 0.72rem 0.36rem 0.42rem;
  color: #1d3c2f;
  font-size: 0.78rem;
  font-weight: 700;
  box-shadow: 0 10px 20px -18px rgba(18, 74, 49, 0.45);
  transition: transform 160ms ease, box-shadow 180ms ease, border-color 180ms ease;
}

.back-nav-btn:hover {
  transform: translateX(-2px);
  border-color: rgba(27, 111, 73, 0.4);
  box-shadow: 0 12px 24px -16px rgba(18, 74, 49, 0.48);
}

.back-nav-icon {
  display: inline-flex;
  height: 1.5rem;
  width: 1.5rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(13, 143, 75, 0.14);
  color: #0f8b4e;
  font-size: 0.85rem;
}

.back-nav-text {
  line-height: 1;
}

.pro-chat-window {
  max-height: 22rem;
  overflow-y: auto;
  border-radius: 0.9rem;
  border: 1px solid #dce8e1;
  background: #f9fcfa;
  padding: 0.75rem;
}

.pro-chat-message {
  margin-bottom: 0.65rem;
  max-width: 86%;
  border-radius: 0.85rem;
  padding: 0.55rem 0.7rem;
}

.pro-chat-message:last-child {
  margin-bottom: 0;
}

.pro-chat-message.is-assistant {
  border: 1px solid #d2e5d9;
  background: #eff8f3;
}

.pro-chat-message.is-user {
  margin-left: auto;
  border: 1px solid #d6dce7;
  background: #ffffff;
}

.pro-chat-role {
  margin-bottom: 0.3rem;
  font-size: 0.68rem;
  font-weight: 700;
  color: #60706a;
}

.pro-chat-content {
  white-space: pre-wrap;
  font-size: 0.82rem;
  line-height: 1.5;
  color: #1e2c25;
}

.pro-chat-thinking {
  margin-top: 0.7rem;
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid #d2e5d9;
  background: #eff8f3;
  padding: 0.35rem 0.6rem;
  font-size: 0.72rem;
  color: #4f655b;
}

.pro-chat-thinking .dot {
  margin-right: 0.25rem;
  height: 0.34rem;
  width: 0.34rem;
  border-radius: 999px;
  background: #7aa992;
  animation: dotPulse 1.2s infinite ease-in-out;
}

.pro-chat-thinking .dot:nth-child(2) {
  animation-delay: 120ms;
}

.pro-chat-thinking .dot:nth-child(3) {
  animation-delay: 240ms;
}

@keyframes dotPulse {
  0%,
  80%,
  100% {
    transform: scale(0.7);
    opacity: 0.55;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

.back-nav-side {
  position: absolute;
  left: 0.5rem;
  top: 1.25rem;
  z-index: 20;
}

@media (min-width: 640px) {
  .back-nav-side {
    left: 1rem;
  }
}

@media (min-width: 1280px) {
  .back-nav-side {
    left: 1.5rem;
  }
}
</style>
