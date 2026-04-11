<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElDatePicker, ElOption } from 'element-plus';
import { getApiClient } from '../../lib/api-client';
import { storeDraftStreamPayload } from '../../lib/plan-assistant-stream';
import { authState } from '../../stores/auth';
import UiErrorToast from '../../components/UiErrorToast.vue';
import UiSunriseSelect from '../../components/UiSunriseSelect.vue';

type PlanMode = 'basic' | 'pro';
type CycleValue = '1w' | '1m' | '3m' | '6m' | 'custom';
type PlanScenario = 'study' | 'work' | 'exam' | 'fitness' | 'other';
type StartingPoint = '' | 'none' | 'newbie' | 'junior' | 'intermediate' | 'advanced';
type OutputMode = 'daily' | 'phase-weekly' | 'phase-monthly';
type GranularityMode = 'smart' | 'deep' | 'rough';
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

function calcDurationDays(startDate: string, endDate: string) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const diff = end.getTime() - start.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, days);
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
const focusAreas = ref<string[]>([]);
const focusAreaInput = ref('');
const focusAreaHint = ref('');
const MAX_FOCUS_AREAS = 8;
/** 普通版「更多选填」折叠面板默认收起，减轻首屏压力 */
const basicOptionalExpanded = ref(false);

const basicOptionalFilledCount = computed(() => {
  let n = 0;
  if (form.startingPoint) n++;
  if (form.preference.trim()) n++;
  if (focusAreas.value.length > 0) n++;
  if (form.timeInvestment !== 'none') n++;
  if (form.granularityMode !== 'smart') n++;
  return n;
});

const chatMessages = ref<ChatMessage[]>([
  {
    id: 'chat-init',
    role: 'assistant',
    content: '你好，我是你的计划助手。填写上面的基础信息后，点击“AI生成初稿”，我会先给你一版初始计划，然后我们再对话优化。',
  },
]);

const form = reactive({
  planScenario: '' as PlanScenario | '',
  goal: '',
  requirement: '',
  startingPoint: '' as StartingPoint,
  startDate: today,
  cycle: '1m' as CycleValue,
  customEndDate: '',
  preference: '',
  timeInvestment: 'none',
  timeInvestmentCustomHours: '',
  outputMode: 'daily' as OutputMode,
  granularityMode: 'smart' as GranularityMode,
  reminderMode: 'standard' as ReminderMode,
  aiDepth: 'basic' as AiDepth,
});

const errors = reactive({
  planScenario: '',
  goal: '',
  requirement: '',
  startDate: '',
  customEndDate: '',
  timeInvestmentCustomHours: '',
});

const scenarioOptions = [
  { label: '学习', value: 'study' },
  { label: '工作', value: 'work' },
  { label: '考试', value: 'exam' },
  { label: '健身', value: 'fitness' },
  { label: '其他', value: 'other' },
] as const;

const startingPointOptionsMap: Record<PlanScenario, Array<{ label: string; value: Exclude<StartingPoint, ''> }>> = {
  study: [
    { label: '零基础', value: 'none' },
    { label: '入门', value: 'newbie' },
    { label: '进阶', value: 'intermediate' },
    { label: '熟练', value: 'advanced' },
  ],
  work: [
    { label: '未启动', value: 'none' },
    { label: '已了解背景', value: 'newbie' },
    { label: '可独立执行', value: 'intermediate' },
    { label: '可带人推进', value: 'advanced' },
  ],
  exam: [
    { label: '基础薄弱', value: 'none' },
    { label: '基础一般', value: 'newbie' },
    { label: '接近目标线', value: 'intermediate' },
    { label: '冲刺阶段', value: 'advanced' },
  ],
  fitness: [
    { label: '刚开始', value: 'none' },
    { label: '已建立习惯', value: 'newbie' },
    { label: '稳定提升', value: 'intermediate' },
    { label: '进阶强化', value: 'advanced' },
  ],
  other: [
    { label: '刚开始', value: 'none' },
    { label: '有初步经验', value: 'newbie' },
    { label: '可稳定推进', value: 'intermediate' },
    { label: '高熟练度', value: 'advanced' },
  ],
};

const cycleOptions = [
  { label: '1周', value: '1w' },
  { label: '1个月', value: '1m' },
  { label: '3个月', value: '3m' },
  { label: '半年', value: '6m' },
  { label: '自定义', value: 'custom' },
] as const;

const timeInvestmentOptions = [
  { label: '无', value: 'none' },
  { label: '每天30分钟', value: '30m_daily' },
  { label: '每天1小时', value: '1h_daily' },
  { label: '每周5小时', value: '5h_weekly' },
  { label: '每周10小时', value: '10h_weekly' },
  { label: '自定义', value: 'custom' },
] as const;

const outputModeOptions = [
  { label: '精确到每天任务', value: 'daily' },
  { label: '分阶段（周）', value: 'phase-weekly' },
  { label: '分阶段（月）', value: 'phase-monthly' },
] as const;

const granularityOptions = [
  { label: '智能推荐', value: 'smart' },
  { label: '深度计划', value: 'deep' },
  { label: '粗略计划', value: 'rough' },
] as const;

const effectiveDeadline = computed(() => {
  if (form.cycle === 'custom') return form.customEndDate;
  return computeDeadlineByCycle(form.startDate, form.cycle);
});

const recommendedMode = computed<GranularityMode>(() => {
  const endDate = effectiveDeadline.value || form.startDate;
  const days = calcDurationDays(form.startDate, endDate);
  return days < 30 ? 'deep' : 'rough';
});

const granularityHint = computed(() => {
  if (form.granularityMode !== 'smart') return '';
  return recommendedMode.value === 'deep'
    ? '智能推荐：当前周期更适合深度计划（按天 + 阶段总结）。'
    : '智能推荐：当前周期更适合粗略计划（按周推进）。';
});

const acceptedPlanFileTypes = ['txt', 'md', 'markdown', 'doc', 'docx'] as const;

const startingPointOptions = computed(() => {
  if (!form.planScenario) return [];
  return startingPointOptionsMap[form.planScenario];
});

function normalizeFocusArea(raw: string) {
  return raw.trim().replace(/\s+/g, ' ');
}

function addFocusArea(raw: string) {
  const next = normalizeFocusArea(raw);
  if (!next) return;
  if (focusAreas.value.includes(next)) {
    focusAreaHint.value = '该重点项已存在';
    return;
  }
  if (focusAreas.value.length >= MAX_FOCUS_AREAS) {
    focusAreaHint.value = `最多添加${MAX_FOCUS_AREAS}个重点项`;
    return;
  }
  focusAreas.value.push(next);
  focusAreaHint.value = '';
}

function removeFocusArea(index: number) {
  if (index < 0 || index >= focusAreas.value.length) return;
  focusAreas.value.splice(index, 1);
  if (focusAreas.value.length < MAX_FOCUS_AREAS && focusAreaHint.value.includes('最多添加')) {
    focusAreaHint.value = '';
  }
}

function handleFocusAreaKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ',') return;
  event.preventDefault();
  addFocusArea(focusAreaInput.value);
  focusAreaInput.value = '';
}

function handleFocusAreaBlur() {
  if (!focusAreaInput.value.trim()) return;
  addFocusArea(focusAreaInput.value);
  focusAreaInput.value = '';
}

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
  const scenarioLabel = scenarioOptions.find((item) => item.value === form.planScenario)?.label ?? '未指定';
  const contextLines = [
    `- 计划场景：${scenarioLabel}`,
    `- 目标名称：${form.goal || '（待补充）'}`,
    `- 目标说明：${form.requirement || '（待补充）'}`,
    `- 计划开始时间：${form.startDate || today}`,
    `- 计划周期：${getCycleLabel(form.cycle)}（预计完成：${endDateText}）`,
  ];
  if (form.startingPoint) contextLines.push(`- 起点状态：${form.startingPoint}`);
  if (form.preference.trim()) contextLines.push(`- 偏好与约束：${form.preference.trim()}`);
  if (focusAreas.value.length) contextLines.push(`- 重点倾斜/薄弱项：${focusAreas.value.join('、')}`);
  if (form.timeInvestment === 'custom' && form.timeInvestmentCustomHours) {
    contextLines.push(`- 可投入时间：每周约 ${form.timeInvestmentCustomHours} 小时`);
  } else if (form.timeInvestment !== 'none') {
    contextLines.push(`- 可投入时间：${form.timeInvestment}`);
  }
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
  errors.planScenario = form.planScenario ? '' : '请选择计划场景';
  errors.goal = form.goal.trim() ? '' : '请输入计划名称';
  errors.requirement = form.requirement.trim() ? '' : '请输入计划内容';
  errors.startDate = form.startDate ? '' : '请选择计划开始时间';
  errors.customEndDate = form.cycle === 'custom' && !form.customEndDate ? '请选择计划完成时间' : '';
  errors.timeInvestmentCustomHours =
    form.timeInvestment === 'custom' &&
    (!form.timeInvestmentCustomHours ||
      Number.isNaN(Number(form.timeInvestmentCustomHours)) ||
      Number(form.timeInvestmentCustomHours) <= 0)
      ? '请输入有效的每周投入小时（大于0）'
      : '';
  return (
    !errors.planScenario &&
    !errors.goal &&
    !errors.requirement &&
    !errors.startDate &&
    !errors.customEndDate &&
    !errors.timeInvestmentCustomHours
  );
}

async function handleSubmit() {
  if (!validateForm()) return;
  isSubmitting.value = true;
  const planScenario = form.planScenario as PlanScenario;

  const client = getApiClient();
  /** 先落库用户填写的正文；第三方 AI 在草稿页流式生成后写回 v1 */
  const finalRequirement = form.requirement.trim();

  const profile = {
    planMode: planTierMode.value,
    basicInfo: {
      planScenario,
      planName: form.goal,
      planContent: finalRequirement,
      startingPoint: form.startingPoint,
      currentLevel: form.startingPoint || 'none',
      startDate: form.startDate,
      cycle: form.cycle,
      endDate: effectiveDeadline.value || form.startDate,
      preference: form.preference.trim(),
      focusAreas: focusAreas.value,
      timeInvestment:
        form.timeInvestment === 'custom'
          ? `custom:${Number(form.timeInvestmentCustomHours)}h_weekly`
          : form.timeInvestment,
      timeInvestmentCustomHours:
        form.timeInvestment === 'custom' ? Number(form.timeInvestmentCustomHours) : undefined,
      outputMode: form.outputMode,
      granularityMode: form.granularityMode,
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
      planScenario,
      goal: form.goal,
      requirement: finalRequirement,
      startDate: form.startDate,
      cycle: form.cycle,
      deadline: effectiveDeadline.value,
      startingPoint: form.startingPoint,
      preference: form.preference,
      focusAreas: focusAreas.value,
      timeInvestment:
        form.timeInvestment === 'custom'
          ? `custom:${Number(form.timeInvestmentCustomHours)}h_weekly`
          : form.timeInvestment,
      outputMode: form.outputMode,
      granularityMode: form.granularityMode,
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

  storeDraftStreamPayload(plan.id, {
    assistantPrompt: generatedPrompt.value,
    startDate: form.startDate,
    cycle: form.cycle,
    endDate: effectiveDeadline.value || form.startDate,
  });

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

watch(
  () => form.planScenario,
  () => {
    if (!form.planScenario) {
      form.startingPoint = '';
      return;
    }
    const validValues = new Set(startingPointOptionsMap[form.planScenario].map((item) => item.value));
    if (form.startingPoint && !validValues.has(form.startingPoint)) {
      form.startingPoint = '';
    }
  }
);

watch(
  () => form.timeInvestment,
  () => {
    if (form.timeInvestment !== 'custom') {
      form.timeInvestmentCustomHours = '';
    }
  }
);

watch(
  () => focusAreaInput.value,
  () => {
    if (!focusAreaHint.value || focusAreaHint.value.includes('最多添加')) return;
    focusAreaHint.value = '';
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
  <div class="plan-create-view relative flex h-[100dvh] flex-col overflow-hidden font-display text-[#111813]">
    <UiErrorToast :message="errorToastMessage" @close="closeErrorToast" />

    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="bg-grid absolute inset-0"></div>
      <div class="bg-orb bg-orb-left"></div>
      <div class="bg-orb bg-orb-right"></div>
      <div class="bg-orb bg-orb-bottom"></div>
      <div class="plan-create-grain" aria-hidden="true"></div>
    </div>

    <header class="plan-create-sticky-bar relative z-50 shrink-0 border-b border-[#dbe8e1]/90">
      <div class="plan-create-header-sheen" aria-hidden="true"></div>
      <div
        class="relative flex w-full items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8 sm:py-3"
      >
        <div class="relative z-10 flex min-w-0 items-center gap-2 sm:gap-3">
          <div class="size-5 shrink-0 sm:size-6">
            <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 6H42L36 24L42 42H6L12 24L6 6Z" fill="currentColor" />
            </svg>
          </div>
          <h2 class="truncate text-sm font-bold tracking-[-0.015em] text-[#1f2a24] sm:text-base">计划大师</h2>
        </div>
        <h1
          class="create-page-title pointer-events-none absolute left-1/2 top-1/2 z-0 max-w-[min(52vw,14rem)] -translate-x-1/2 -translate-y-1/2 truncate text-center text-sm font-black leading-[1.1] tracking-[-0.04em] text-[#111813] sm:max-w-none sm:px-2 sm:text-base md:text-xl md:tracking-[-0.05em] lg:text-2xl"
        >
          创建你的新计划
        </h1>
        <div class="relative z-10 flex min-w-0 justify-end">
          <router-link
            to="/plans"
            class="shrink-0 text-xs font-semibold text-[#2d3b34] transition hover:text-[#0f8b4e] sm:text-sm"
          >
            我的计划
          </router-link>
        </div>
      </div>
    </header>

    <div class="plan-create-scroll ui-scrollbar relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
      <main class="plan-create-main px-4 pb-8 pt-4 sm:px-6 sm:pt-5 lg:px-8">
        <div class="mx-auto flex w-full max-w-5xl items-start gap-3 sm:gap-4">
          <button type="button" class="back-nav-btn shrink-0 self-start" aria-label="返回上一页" @click="goBack">
            <span class="back-nav-icon" aria-hidden="true">←</span>
            <span class="back-nav-text">返回上一页</span>
          </button>

          <form id="plan-create-form" class="flex min-w-0 flex-1 flex-col gap-6" @submit.prevent="handleSubmit">
        <section v-if="!isProMode" class="create-surface create-surface--hero create-plan-unified-card rounded-2xl border border-[#e6ebe8] bg-white p-5 shadow-sm sm:p-6">
          <div class="plan-create-card-border" aria-hidden="true"></div>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="tier-tab-rail inline-flex rounded-full bg-[#e8f0ec] p-1 ring-1 ring-[#0f8b4e]/15" role="tablist" aria-label="创建计划版本">
              <button
                data-testid="tier-tab-basic"
                type="button"
                role="tab"
                class="rounded-full px-4 py-1.5 text-xs font-semibold transition duration-200"
                :class="!isProMode ? 'tier-tab-active bg-white text-[#1f2a24]' : 'text-[#6a7771] hover:text-[#33433b]'"
                @click="switchTierMode('basic')"
              >
                普通版
              </button>
              <button
                data-testid="tier-tab-pro"
                type="button"
                role="tab"
                class="rounded-full px-4 py-1.5 text-xs font-semibold transition duration-200"
                :class="isProMode ? 'tier-tab-active bg-white text-[#1f2a24]' : 'text-[#6a7771] hover:text-[#33433b]'"
                @click="switchTierMode('pro')"
              >
                专业版
              </button>
            </div>
          </div>
          <p class="mt-3 text-sm leading-relaxed text-[#64716b]">
            当前为{{ isProMode ? '专业版创建计划' : '普通版创建计划' }}。迈出第一步就好——不必一次写完美，先让心里那个目标落在纸上。
          </p>
          <div class="mt-3 flex flex-wrap items-center gap-4 text-xs text-[#64716b]">
            <span class="inline-flex items-center gap-1.5"><span class="field-icon required field-icon-pulse">✦</span>必填</span>
            <span class="inline-flex items-center gap-1.5"><span class="field-icon optional">◌</span>非必填</span>
          </div>
          <div
            v-if="showUpgradeHint && authState.tier === 'basic'"
            data-testid="upgrade-hint"
            class="mt-3 rounded-lg border border-primary/35 bg-primary/10 px-3 py-2 text-xs font-semibold text-[#0b8d4a]"
          >
            当前为普通版，升级后可启用高级拆解与智能提醒策略。
          </div>

          <div class="my-5 border-t border-[#e8eeea]"></div>

          <h3 class="text-base font-bold text-[#26302b]">基础信息</h3>
          <p class="mb-4 mt-1 text-sm leading-relaxed text-[#5f6d66]">
            先完成标有 ✦ 的几项即可提交；其余随时可补，我们会陪你把路走稳。
          </p>
          <div class="basic-form-grid grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-x-6 md:gap-y-5">
              <label class="flex min-w-0 flex-col">
                <p class="field-label"><span class="field-icon required">✦</span>计划场景</p>
                <div data-testid="field-plan-scenario" class="ui-sunrise-select-shell w-full">
                  <UiSunriseSelect
                    v-model="form.planScenario"
                    aria-label="计划场景"
                    size="large"
                    placeholder="请选择场景"
                  >
                    <ElOption v-for="option in scenarioOptions" :key="option.value" :label="option.label" :value="option.value" />
                  </UiSunriseSelect>
                </div>
                <p v-if="errors.planScenario" class="mt-2 text-xs font-semibold text-[#cc4338]">{{ errors.planScenario }}</p>
              </label>

              <label class="flex min-w-0 flex-col">
                <p class="field-label"><span class="field-icon required">✦</span>计划名称</p>
                <input
                  v-model="form.goal"
                  aria-label="计划名称"
                  class="form-control-input h-14 p-[15px] text-base"
                  placeholder="例如，学习一门新语言"
                />
                <p v-if="errors.goal" class="mt-2 text-xs font-semibold text-[#cc4338]">{{ errors.goal }}</p>
              </label>

              <label class="flex flex-col md:col-span-2">
                <p class="field-label"><span class="field-icon required">✦</span>计划内容</p>
                <textarea
                  v-model="form.requirement"
                  aria-label="计划内容"
                  class="form-control-textarea min-h-32 p-[15px] text-base leading-relaxed md:min-h-36"
                  placeholder="在这里描述你希望通过这个计划达成的具体成果..."
                />
                <p v-if="errors.requirement" class="mt-2 text-xs font-semibold text-[#cc4338]">{{ errors.requirement }}</p>
              </label>

              <label class="flex flex-col md:min-w-0">
                <p class="field-label"><span class="field-icon required">✦</span>计划开始时间</p>
                <div class="plan-date-shell w-full">
                  <ElDatePicker
                    v-model="form.startDate"
                    type="date"
                    value-format="YYYY-MM-DD"
                    format="YYYY-MM-DD"
                    class="plan-create-date-picker w-full"
                    :disabled-date="disableBeforeToday"
                    placeholder="请选择计划开始时间"
                  />
                </div>
                <p v-if="errors.startDate" class="mt-2 text-xs font-semibold text-[#cc4338]">{{ errors.startDate }}</p>
              </label>

              <label class="flex flex-col md:min-w-0">
                <p class="field-label"><span class="field-icon required">✦</span>计划周期</p>
                <div data-testid="field-cycle" class="ui-sunrise-select-shell w-full">
                  <UiSunriseSelect
                    v-model="form.cycle"
                    aria-label="计划周期"
                    size="large"
                  >
                    <ElOption v-for="option in cycleOptions" :key="option.value" :label="option.label" :value="option.value" />
                  </UiSunriseSelect>
                </div>
              </label>

              <label v-if="form.cycle === 'custom'" class="flex flex-col md:col-span-2" data-testid="custom-end-date">
                <p class="field-label"><span class="field-icon required">✦</span>计划完成时间</p>
                <div class="plan-date-shell w-full">
                  <ElDatePicker
                    v-model="form.customEndDate"
                    type="date"
                    value-format="YYYY-MM-DD"
                    format="YYYY-MM-DD"
                    class="plan-create-date-picker w-full"
                    :disabled-date="disableBeforeStartDate"
                    placeholder="请选择计划完成时间"
                  />
                </div>
                <p v-if="errors.customEndDate" class="mt-2 text-xs font-semibold text-[#cc4338]">{{ errors.customEndDate }}</p>
              </label>

              <label class="flex flex-col md:min-w-0">
                <p class="field-label"><span class="field-icon required">✦</span>输出形式</p>
                <div data-testid="field-output-mode" class="ui-sunrise-select-shell w-full">
                  <UiSunriseSelect
                    v-model="form.outputMode"
                    aria-label="输出形式"
                    size="large"
                  >
                    <ElOption
                      v-for="option in outputModeOptions"
                      :key="option.value"
                      :label="option.label"
                      :value="option.value"
                    />
                  </UiSunriseSelect>
                </div>
              </label>

              <div
                class="deadline-hint flex flex-col justify-center rounded-xl border border-dashed border-[#d6e7dd] bg-[#f8fcfa] px-4 py-3 text-xs leading-5 text-[#5f6d66] md:min-h-[3.25rem]"
              >
                预计完成时间：<span class="font-semibold text-[#1f2d27]">{{ effectiveDeadline || '待选择' }}</span>
              </div>

              <div
                class="optional-advanced-card rounded-2xl border border-[#dfe9e3] bg-[#fbfcfb] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] md:col-span-2"
              >
                <button
                  type="button"
                  data-testid="basic-optional-toggle"
                  class="optional-advanced-toggle"
                  :aria-expanded="basicOptionalExpanded"
                  aria-controls="basic-optional-panel"
                  @click="basicOptionalExpanded = !basicOptionalExpanded"
                >
                  <span class="flex min-w-0 flex-1 flex-col items-start gap-1 text-left sm:flex-row sm:items-center sm:gap-3">
                    <span class="optional-advanced-title">更多选项</span>
                    <span class="optional-advanced-subtitle">选填 · 起点、时间投入、颗粒度等</span>
                    <span
                      v-if="basicOptionalFilledCount > 0 && !basicOptionalExpanded"
                      class="optional-advanced-badge"
                    >
                      已填 {{ basicOptionalFilledCount }} 项
                    </span>
                  </span>
                  <span class="optional-advanced-chevron" :class="{ 'is-open': basicOptionalExpanded }" aria-hidden="true">▼</span>
                </button>
                <div
                  id="basic-optional-panel"
                  v-show="basicOptionalExpanded"
                  class="optional-advanced-body flex flex-col gap-5 px-3 pb-4 pt-1 sm:px-4"
                >
                  <label class="flex flex-col">
                    <p class="field-label"><span class="field-icon optional">◌</span>起点状态</p>
                    <div data-testid="field-starting-point" class="ui-sunrise-select-shell w-full">
                      <UiSunriseSelect
                        v-model="form.startingPoint"
                        aria-label="起点状态"
                        size="large"
                        :placeholder="form.planScenario ? '可选：描述你现在的基础' : '请先选择计划场景'"
                        :disabled="!form.planScenario"
                      >
                        <ElOption label="不设置" value="" />
                        <ElOption
                          v-for="option in startingPointOptions"
                          :key="option.value"
                          :label="option.label"
                          :value="option.value"
                        />
                      </UiSunriseSelect>
                    </div>
                  </label>

                  <label class="flex flex-col">
                    <p class="field-label"><span class="field-icon optional">◌</span>偏好与约束</p>
                    <textarea
                      v-model="form.preference"
                      class="form-control-textarea min-h-24 p-[15px] text-base leading-relaxed"
                      placeholder="例如：工作日晚上可投入，周三不安排高强度任务"
                    />
                  </label>

                  <label class="flex flex-col">
                    <p class="field-label"><span class="field-icon optional">◌</span>重点倾斜 / 薄弱项</p>
                    <div class="form-control-tagbox p-3">
                      <div v-if="focusAreas.length" class="mb-2 flex flex-wrap gap-2">
                        <span
                          v-for="(item, index) in focusAreas"
                          :key="`${item}-${index}`"
                          class="inline-flex items-center gap-1 rounded-full bg-[#ecf8f0] px-2.5 py-1 text-xs font-semibold text-[#1c5e3f]"
                        >
                          {{ item }}
                          <button
                            type="button"
                            class="rounded-full px-1 text-[#2b7a53] transition hover:bg-[#dff0e7]"
                            :aria-label="`删除重点项-${item}`"
                            @click="removeFocusArea(index)"
                          >
                            ×
                          </button>
                        </span>
                      </div>
                      <input
                        v-model="focusAreaInput"
                        aria-label="添加重点倾斜"
                        class="h-9 w-full border-none bg-transparent text-sm outline-none"
                        placeholder="输入后按 Enter 或逗号添加，例如：数学"
                        :disabled="focusAreas.length >= MAX_FOCUS_AREAS"
                        @keydown="handleFocusAreaKeydown"
                        @blur="handleFocusAreaBlur"
                      />
                      <p class="mt-1 text-xs text-[#6f7e76]">{{ focusAreas.length }}/{{ MAX_FOCUS_AREAS }}</p>
                      <p
                        v-if="focusAreas.length >= MAX_FOCUS_AREAS"
                        class="mt-1 text-xs font-semibold text-[#cc4338]"
                      >
                        最多添加{{ MAX_FOCUS_AREAS }}个重点项
                      </p>
                      <p v-if="focusAreaHint" class="mt-1 text-xs font-semibold text-[#cc4338]">{{ focusAreaHint }}</p>
                    </div>
                  </label>

                  <label class="flex flex-col">
                    <p class="field-label"><span class="field-icon optional">◌</span>投入时间</p>
                    <div data-testid="field-time-investment" class="ui-sunrise-select-shell w-full">
                      <UiSunriseSelect
                        v-model="form.timeInvestment"
                        aria-label="投入时间"
                        size="large"
                      >
                        <ElOption
                          v-for="option in timeInvestmentOptions"
                          :key="option.value"
                          :label="option.label"
                          :value="option.value"
                        />
                      </UiSunriseSelect>
                    </div>
                    <input
                      v-if="form.timeInvestment === 'custom'"
                      v-model="form.timeInvestmentCustomHours"
                      aria-label="自定义每周投入小时"
                      type="number"
                      min="1"
                      step="1"
                      class="form-control-number mt-3 h-12 p-[15px] text-base"
                      placeholder="请输入每周投入小时（例如 12）"
                    />
                    <p v-if="errors.timeInvestmentCustomHours" class="mt-2 text-xs font-semibold text-[#cc4338]">
                      {{ errors.timeInvestmentCustomHours }}
                    </p>
                  </label>

                  <label class="flex flex-col">
                    <p class="field-label"><span class="field-icon optional">◌</span>计划颗粒度</p>
                    <div data-testid="field-granularity" class="ui-sunrise-select-shell w-full">
                      <UiSunriseSelect
                        v-model="form.granularityMode"
                        aria-label="计划颗粒度"
                        size="large"
                      >
                        <ElOption
                          v-for="option in granularityOptions"
                          :key="option.value"
                          :label="option.label"
                          :value="option.value"
                        />
                      </UiSunriseSelect>
                    </div>
                    <p v-if="granularityHint" class="mt-2 text-xs text-[#5f6d66]">{{ granularityHint }}</p>
                  </label>
                </div>
              </div>
            </div>
          </section>

          <section v-else class="space-y-6" data-testid="pro-capability-panel">
            <div class="create-surface create-surface--hero create-plan-unified-card rounded-2xl border border-[#e6ebe8] bg-white p-5 shadow-sm sm:p-6">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="tier-tab-rail inline-flex rounded-full bg-[#e8f0ec] p-1 ring-1 ring-[#0f8b4e]/15" role="tablist" aria-label="创建计划版本">
                  <button
                    data-testid="tier-tab-basic"
                    type="button"
                    role="tab"
                    class="rounded-full px-4 py-1.5 text-xs font-semibold transition duration-200"
                    :class="!isProMode ? 'tier-tab-active bg-white text-[#1f2a24]' : 'text-[#6a7771] hover:text-[#33433b]'"
                    @click="switchTierMode('basic')"
                  >
                    普通版
                  </button>
                  <button
                    data-testid="tier-tab-pro"
                    type="button"
                    role="tab"
                    class="rounded-full px-4 py-1.5 text-xs font-semibold transition duration-200"
                    :class="isProMode ? 'tier-tab-active bg-white text-[#1f2a24]' : 'text-[#6a7771] hover:text-[#33433b]'"
                    @click="switchTierMode('pro')"
                  >
                    专业版
                  </button>
                </div>
              </div>
              <p class="mt-3 text-sm leading-relaxed text-[#64716b]">
                当前为专业版创建计划。可用 AI 共创细化方案，填写下方基础信息后生成初稿。
              </p>
              <div class="mt-3 flex flex-wrap items-center gap-4 text-xs text-[#64716b]">
                <span class="inline-flex items-center gap-1.5"><span class="field-icon required">✦</span>必填</span>
                <span class="inline-flex items-center gap-1.5"><span class="field-icon optional">◌</span>非必填</span>
              </div>
              <div class="my-5 border-t border-[#e8eeea]"></div>
              <h3 class="text-base font-bold text-[#26302b]">专业版基础信息</h3>
              <p class="mb-4 mt-1 text-sm text-[#5f6d66]">双列便于一眼核对时间与周期；计划内容仍建议写全。</p>
              <div class="pro-basic-form-grid grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-x-6 md:gap-y-5">
                <label class="flex min-w-0 flex-col">
                  <p class="field-label"><span class="field-icon required">✦</span>计划场景</p>
                  <div data-testid="field-plan-scenario" class="ui-sunrise-select-shell w-full">
                    <UiSunriseSelect
                      v-model="form.planScenario"
                      aria-label="计划场景"
                      size="large"
                      placeholder="请选择场景"
                    >
                      <ElOption v-for="option in scenarioOptions" :key="option.value" :label="option.label" :value="option.value" />
                    </UiSunriseSelect>
                  </div>
                  <p v-if="errors.planScenario" class="mt-2 text-xs font-semibold text-[#cc4338]">{{ errors.planScenario }}</p>
                </label>

                <label class="flex min-w-0 flex-col">
                  <p class="field-label"><span class="field-icon required">✦</span>计划名称</p>
                  <input
                    v-model="form.goal"
                    aria-label="计划名称"
                    class="form-control-input h-14 p-[15px] text-base"
                    placeholder="例如，90天英语口语冲刺"
                  />
                  <p v-if="errors.goal" class="mt-2 text-xs font-semibold text-[#cc4338]">{{ errors.goal }}</p>
                </label>

                <label class="flex flex-col md:col-span-2">
                  <p class="field-label"><span class="field-icon optional">◌</span>上传计划文件</p>
                  <input
                    type="file"
                    aria-label="计划文件上传"
                    accept=".txt,.md,.markdown,.doc,.docx"
                    class="form-control-file h-11 px-3 py-2 text-sm text-[#33433b]"
                    @change="handlePlanFileChange"
                  />
                  <p v-if="uploadedPlanFileName" class="mt-2 text-xs text-[#0f8b4e]">已选择：{{ uploadedPlanFileName }}</p>
                  <p v-if="uploadedFileHint" class="mt-1 text-xs text-[#64716b]">{{ uploadedFileHint }}</p>
                </label>

                <label class="flex flex-col md:col-span-2">
                  <p class="field-label"><span class="field-icon required">✦</span>计划内容</p>
                  <textarea
                    v-model="form.requirement"
                    aria-label="计划内容"
                    class="form-control-textarea min-h-32 p-[15px] text-base leading-relaxed md:min-h-36"
                    placeholder="描述计划目标、边界、你希望 AI 协助细化的重点..."
                  />
                  <p v-if="errors.requirement" class="mt-2 text-xs font-semibold text-[#cc4338]">{{ errors.requirement }}</p>
                </label>

                <label class="flex min-w-0 flex-col">
                  <p class="field-label"><span class="field-icon required">✦</span>开始时间</p>
                  <div class="plan-date-shell w-full">
                    <ElDatePicker
                      v-model="form.startDate"
                      type="date"
                      value-format="YYYY-MM-DD"
                      format="YYYY-MM-DD"
                      class="plan-create-date-picker w-full"
                      :disabled-date="disableBeforeToday"
                      placeholder="请选择计划开始时间"
                    />
                  </div>
                  <p v-if="errors.startDate" class="mt-2 text-xs font-semibold text-[#cc4338]">{{ errors.startDate }}</p>
                </label>

                <label class="flex min-w-0 flex-col">
                  <p class="field-label"><span class="field-icon required">✦</span>计划周期</p>
                  <div data-testid="field-cycle" class="ui-sunrise-select-shell w-full">
                    <UiSunriseSelect
                      v-model="form.cycle"
                      aria-label="计划周期"
                      size="large"
                    >
                      <ElOption v-for="option in cycleOptions" :key="option.value" :label="option.label" :value="option.value" />
                    </UiSunriseSelect>
                  </div>
                </label>

                <label v-if="form.cycle === 'custom'" class="flex flex-col md:col-span-2" data-testid="custom-end-date">
                  <p class="field-label"><span class="field-icon required">✦</span>计划完成时间</p>
                  <div class="plan-date-shell w-full">
                    <ElDatePicker
                      v-model="form.customEndDate"
                      type="date"
                      value-format="YYYY-MM-DD"
                      format="YYYY-MM-DD"
                      class="plan-create-date-picker w-full"
                      :disabled-date="disableBeforeStartDate"
                      placeholder="请选择计划完成时间"
                    />
                  </div>
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

              <div class="pro-chat-window ui-scrollbar mb-3">
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

          </form>
        </div>
      </main>
    </div>

    <div class="create-action-dock shrink-0" data-testid="create-plan-action-dock">
      <div
        class="create-action-dock__inner mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-6"
      >
        <p
          class="create-action-dock__hint text-center text-[11px] leading-snug text-[#6f7e76] sm:max-w-[min(24rem,38vw)] sm:text-left sm:text-xs sm:leading-relaxed sm:text-[#5f6d66]"
        >
          填好必填项即可生成；选填在「更多选项」里随时展开。
        </p>
        <router-link
          to="/plans"
          class="create-action-dock__secondary flex h-11 min-h-[44px] flex-1 items-center justify-center rounded-xl px-5 text-sm font-bold text-[#33433b] transition hover:bg-black/[0.04] sm:flex-initial sm:px-6"
        >
          取消
        </router-link>
        <button
          class="create-action-dock__submit flex h-11 min-h-[44px] min-w-[9.5rem] flex-[1.15] items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-[#111813] shadow-[0_6px_20px_-6px_rgba(18,74,49,0.35)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-initial sm:px-8"
          type="submit"
          form="plan-create-form"
          :disabled="isSubmitting"
        >
          {{ isSubmitting ? '生成中...' : '立即生成计划' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 主题与质感：frontend-design · Sunrise 张扬版（有机 + 能量感） */
.plan-create-view {
  --pc-fg: #0a1f14;
  --pc-fg-soft: #2d3b34;
  --pc-muted: #5f6d66;
  --pc-accent: #0f8b4e;
  --pc-accent-hot: #35cd75;
  --pc-accent-deep: #064428;
  --pc-accent-glow: rgba(53, 205, 117, 0.45);
  --pc-line: rgba(27, 111, 73, 0.14);
  background:
    radial-gradient(ellipse 130% 90% at 100% -25%, rgba(72, 220, 130, 0.28) 0%, transparent 52%),
    radial-gradient(ellipse 100% 70% at -15% 55%, rgba(15, 139, 78, 0.16) 0%, transparent 48%),
    radial-gradient(ellipse 80% 50% at 50% 110%, rgba(185, 226, 206, 0.35) 0%, transparent 45%),
    linear-gradient(168deg, #dff3e8 0%, #f0f7f3 32%, #f3f7f4 55%, #e9f4ec 100%);
}

.plan-create-grain {
  position: absolute;
  inset: 0;
  z-index: 1;
  opacity: 0.072;
  mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Cfilter id='a'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23a)'/%3E%3C/svg%3E");
}

.plan-create-header-sheen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.7;
  background:
    radial-gradient(1200px 70px at 40% 0%, rgba(53, 205, 117, 0.22), transparent 55%),
    radial-gradient(900px 70px at 75% 0%, rgba(15, 139, 78, 0.16), transparent 60%);
  mix-blend-mode: multiply;
}

@media (prefers-reduced-motion: no-preference) {
  .plan-create-header-sheen {
    background-size: 200% 100%;
    animation: plan-create-sheen-pan 9s ease-in-out infinite;
  }
}

@keyframes plan-create-sheen-pan {
  0%,
  100% {
    background-position: 0% 0%, 30% 0%;
    opacity: 0.62;
  }
  50% {
    background-position: 100% 0%, 80% 0%;
    opacity: 0.86;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .create-plan-unified-card {
    animation: plan-create-card-in 0.65s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
}

@media (prefers-reduced-motion: reduce) {
  .create-plan-unified-card {
    animation: none;
  }
}

@keyframes plan-create-card-in {
  from {
    opacity: 0;
    transform: translateY(22px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.create-page-title {
  background: linear-gradient(
    115deg,
    var(--pc-fg) 0%,
    var(--pc-accent-deep) 28%,
    var(--pc-accent) 52%,
    var(--pc-accent-hot) 78%,
    #0d6b3d 100%
  );
  background-size: 160% 160%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

@media (prefers-reduced-motion: no-preference) {
  .create-page-title {
    animation: plan-create-title-shift 7s ease-in-out infinite;
  }
}

@keyframes plan-create-title-shift {
  0%,
  100% {
    background-position: 0% 40%;
    filter: drop-shadow(0 0 10px rgba(53, 205, 117, 0.22));
  }
  50% {
    background-position: 100% 60%;
    filter: drop-shadow(0 0 18px rgba(53, 205, 117, 0.38));
  }
}

@supports not (background-clip: text) {
  .create-page-title {
    color: var(--pc-accent-deep);
    background: none;
    animation: none;
    filter: none;
  }
}

.plan-create-card-border {
  position: absolute;
  inset: -1px;
  border-radius: 1rem;
  pointer-events: none;
  opacity: 0.55;
  background: linear-gradient(
    130deg,
    rgba(53, 205, 117, 0.0) 0%,
    rgba(53, 205, 117, 0.28) 22%,
    rgba(255, 255, 255, 0.65) 50%,
    rgba(15, 139, 78, 0.24) 76%,
    rgba(15, 139, 78, 0.0) 100%
  );
  filter: blur(0.2px);
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  padding: 1px;
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}

@media (prefers-reduced-motion: no-preference) {
  .plan-create-card-border {
    background-size: 180% 180%;
    animation: plan-create-border-shift 8s ease-in-out infinite;
  }
}

@keyframes plan-create-border-shift {
  0%,
  100% {
    background-position: 0% 40%;
    opacity: 0.45;
  }
  50% {
    background-position: 100% 60%;
    opacity: 0.72;
  }
}

.tier-tab-active {
  box-shadow:
    0 0 0 1px rgba(15, 139, 78, 0.2),
    0 6px 20px -6px rgba(15, 139, 78, 0.45),
    0 2px 8px -4px rgba(53, 205, 117, 0.35);
}

.tier-tab-rail {
  box-shadow: 0 2px 12px -6px rgba(18, 74, 49, 0.18);
}

@media (prefers-reduced-motion: no-preference) {
  .tier-tab-rail {
    position: relative;
    overflow: hidden;
  }

  .tier-tab-rail::after {
    content: '';
    position: absolute;
    inset: -30% -60%;
    background: radial-gradient(circle at 30% 50%, rgba(53, 205, 117, 0.18), transparent 55%);
    transform: translateX(-12%);
    animation: plan-create-rail-breathe 6.5s ease-in-out infinite;
    pointer-events: none;
  }
}

@keyframes plan-create-rail-breathe {
  0%,
  100% {
    transform: translateX(-10%) scale(1);
    opacity: 0.55;
  }
  50% {
    transform: translateX(10%) scale(1.05);
    opacity: 0.95;
  }
}

.field-icon-pulse {
  position: relative;
}

@media (prefers-reduced-motion: no-preference) {
  .field-icon-pulse::after {
    content: '';
    position: absolute;
    inset: -6px;
    border-radius: 999px;
    background: radial-gradient(circle, rgba(53, 205, 117, 0.35), transparent 60%);
    animation: plan-create-required-ping 2.6s ease-in-out infinite;
    pointer-events: none;
  }
}

@keyframes plan-create-required-ping {
  0%,
  100% {
    transform: scale(0.85);
    opacity: 0.25;
  }
  40% {
    transform: scale(1.05);
    opacity: 0.65;
  }
  70% {
    transform: scale(0.92);
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .form-control-input:focus,
  .form-control-textarea:focus,
  .form-control-number:focus {
    animation: plan-create-focus-spark 520ms ease-out both;
  }
}

@keyframes plan-create-focus-spark {
  from {
    box-shadow:
      0 0 0 3px rgba(15, 139, 78, 0.14),
      0 4px 16px rgba(18, 74, 49, 0.08),
      0 0 0 0 rgba(53, 205, 117, 0.0);
  }
  to {
    box-shadow:
      0 0 0 3px rgba(15, 139, 78, 0.14),
      0 4px 16px rgba(18, 74, 49, 0.08),
      0 0 32px -12px rgba(53, 205, 117, 0.22);
  }
}

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

.create-surface {
  box-shadow:
    0 20px 50px -32px rgba(18, 74, 49, 0.38),
    0 8px 24px -12px rgba(53, 205, 117, 0.15),
    0 0 0 1px rgba(255, 255, 255, 0.65) inset,
    0 0 48px -20px rgba(53, 205, 117, 0.25);
  transition:
    box-shadow 0.3s ease,
    border-color 0.2s ease,
    transform 0.35s ease;
}

@media (prefers-reduced-motion: no-preference) {
  .create-plan-unified-card.create-surface:hover {
    box-shadow:
      0 24px 56px -36px rgba(18, 74, 49, 0.42),
      0 10px 28px -14px rgba(53, 205, 117, 0.22),
      0 0 0 1px rgba(255, 255, 255, 0.7) inset,
      0 0 56px -18px rgba(53, 205, 117, 0.32);
  }
}

.create-surface--hero {
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.97) 0%, rgba(236, 252, 242, 0.55) 38%, rgba(255, 255, 255, 0.92) 62%, rgba(240, 249, 244, 0.9) 100%),
    linear-gradient(168deg, #ffffff 0%, #f3fdf7 45%, #ffffff 100%);
}

.deadline-hint {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.plan-create-sticky-bar {
  position: relative;
  z-index: 50;
  padding-top: env(safe-area-inset-top, 0px);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.97) 0%, rgba(244, 252, 247, 0.92) 55%, rgba(255, 255, 255, 0.94) 100%);
  backdrop-filter: blur(16px) saturate(1.15);
  -webkit-backdrop-filter: blur(16px) saturate(1.15);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.85) inset,
    0 10px 32px -22px rgba(18, 74, 49, 0.28),
    0 0 40px -24px rgba(53, 205, 117, 0.12);
}

.create-action-dock {
  position: relative;
  z-index: 30;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  border-top: 1px solid rgba(15, 139, 78, 0.18);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.97) 0%, rgba(240, 250, 244, 0.96) 100%);
  box-shadow:
    0 -14px 40px -18px rgba(18, 74, 49, 0.28),
    0 -1px 0 rgba(255, 255, 255, 0.85) inset,
    0 0 48px -20px rgba(53, 205, 117, 0.15);
  backdrop-filter: blur(16px) saturate(1.12);
  -webkit-backdrop-filter: blur(16px) saturate(1.12);
}

.create-action-dock__submit {
  position: relative;
  overflow: hidden;
}

@media (prefers-reduced-motion: no-preference) {
  .create-action-dock__submit::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      105deg,
      transparent 0%,
      transparent 40%,
      rgba(255, 255, 255, 0.45) 50%,
      transparent 60%,
      transparent 100%
    );
    transform: translateX(-100%);
    animation: plan-create-dock-shine 3.2s ease-in-out infinite;
    pointer-events: none;
  }
}

@keyframes plan-create-dock-shine {
  0%,
  35% {
    transform: translateX(-100%);
  }
  60%,
  100% {
    transform: translateX(100%);
  }
}

.optional-advanced-toggle {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-radius: 0.85rem;
  border: none;
  background: transparent;
  padding: 0.75rem 0.85rem 0.75rem 1rem;
  text-align: left;
  cursor: pointer;
  transition: background 0.18s ease;
}

.optional-advanced-toggle:hover {
  background: rgba(13, 143, 75, 0.06);
}

.optional-advanced-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: #1f2d27;
  letter-spacing: -0.02em;
}

.optional-advanced-subtitle {
  font-size: 0.75rem;
  font-weight: 500;
  color: #6f7e76;
}

.optional-advanced-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: rgba(13, 143, 75, 0.12);
  padding: 0.15rem 0.55rem;
  font-size: 0.68rem;
  font-weight: 700;
  color: #0b7d45;
}

.optional-advanced-chevron {
  flex-shrink: 0;
  font-size: 0.55rem;
  color: #0f8b4e;
  transition: transform 0.22s ease;
}

.optional-advanced-chevron.is-open {
  transform: rotate(180deg);
}

.form-control-input,
.form-control-textarea,
.form-control-number {
  width: 100%;
  box-sizing: border-box;
  border-radius: 0.85rem;
  border: 1px solid rgba(27, 111, 73, 0.16);
  background: linear-gradient(180deg, #ffffff 0%, #fafdfb 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    0 2px 10px rgba(18, 74, 49, 0.05);
  color: #111813;
  transition:
    border-color 0.2s ease,
    box-shadow 0.22s ease;
}

.form-control-input:hover,
.form-control-textarea:hover,
.form-control-number:hover {
  border-color: rgba(13, 139, 78, 0.28);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.95),
    0 4px 14px rgba(18, 74, 49, 0.07);
}

.form-control-input:focus,
.form-control-textarea:focus,
.form-control-number:focus {
  outline: none;
  border-color: rgba(15, 139, 78, 0.55);
  box-shadow:
    0 0 0 3px rgba(15, 139, 78, 0.14),
    0 4px 16px rgba(18, 74, 49, 0.08);
}

.form-control-input::placeholder,
.form-control-textarea::placeholder,
.form-control-number::placeholder {
  color: #8a9891;
}

.form-control-tagbox {
  border-radius: 0.85rem;
  border: 1px solid rgba(27, 111, 73, 0.16);
  background: linear-gradient(180deg, #ffffff 0%, #fafdfb 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    0 2px 10px rgba(18, 74, 49, 0.05);
  transition:
    border-color 0.2s ease,
    box-shadow 0.22s ease;
}

.form-control-tagbox:focus-within {
  border-color: rgba(15, 139, 78, 0.55);
  box-shadow:
    0 0 0 3px rgba(15, 139, 78, 0.14),
    0 4px 16px rgba(18, 74, 49, 0.08);
}

.form-control-file {
  width: 100%;
  box-sizing: border-box;
  border-radius: 0.85rem;
  border: 1px dashed rgba(27, 111, 73, 0.28);
  background: linear-gradient(180deg, #fcfefc 0%, #f5faf7 100%);
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease;
}

.form-control-file:hover {
  border-color: rgba(15, 139, 78, 0.45);
  background: linear-gradient(180deg, #ffffff 0%, #f3faf6 100%);
}

.plan-date-shell :deep(.el-date-editor.el-input),
.plan-date-shell :deep(.el-date-editor) {
  width: 100%;
}

.plan-date-shell :deep(.el-input__wrapper) {
  min-height: 44px;
  border-radius: 0.85rem;
  border: 1px solid rgba(27, 111, 73, 0.16);
  background: linear-gradient(180deg, #ffffff 0%, #fafdfb 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    0 2px 10px rgba(18, 74, 49, 0.05);
  transition:
    border-color 0.2s ease,
    box-shadow 0.22s ease;
}

.plan-date-shell :deep(.el-input__wrapper.is-focus) {
  border-color: rgba(15, 139, 78, 0.55);
  box-shadow:
    0 0 0 3px rgba(15, 139, 78, 0.14),
    0 4px 16px rgba(18, 74, 49, 0.08);
}

.plan-create-date-picker {
  width: 100%;
}

.bg-grid {
  background-image: linear-gradient(rgba(16, 84, 54, 0.085) 1px, transparent 1px),
    linear-gradient(90deg, rgba(16, 84, 54, 0.085) 1px, transparent 1px);
  background-size: 44px 44px;
  opacity: 0.45;
}

@media (prefers-reduced-motion: no-preference) {
  .bg-grid {
    animation: plan-create-grid-drift 48s linear infinite;
  }
}

@keyframes plan-create-grid-drift {
  0% {
    background-position: 0 0, 0 0;
  }
  100% {
    background-position: 44px 44px, 44px 44px;
  }
}

.bg-orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(46px);
  opacity: 0.52;
  will-change: transform;
}

@media (prefers-reduced-motion: no-preference) {
  .bg-orb-left {
    animation: plan-create-orb-float-a 14s ease-in-out infinite;
  }

  .bg-orb-right {
    animation: plan-create-orb-float-b 18s ease-in-out infinite;
  }

  .bg-orb-bottom {
    animation: plan-create-orb-float-c 20s ease-in-out infinite;
  }
}

.bg-orb-left {
  top: -90px;
  left: -60px;
  height: 280px;
  width: 280px;
  background: radial-gradient(circle at 30% 30%, rgba(53, 205, 117, 0.62), rgba(53, 205, 117, 0));
}

.bg-orb-right {
  top: 120px;
  right: -80px;
  height: 320px;
  width: 320px;
  background: radial-gradient(circle at 50% 50%, rgba(123, 208, 168, 0.55), rgba(100, 200, 150, 0));
}

.bg-orb-bottom {
  bottom: -120px;
  left: 20%;
  height: 300px;
  width: 440px;
  background: radial-gradient(circle at 50% 50%, rgba(185, 226, 206, 0.52), rgba(53, 205, 117, 0));
}

@keyframes plan-create-orb-float-a {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  50% {
    transform: translate(18px, 12px) scale(1.06);
  }
}

@keyframes plan-create-orb-float-b {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  50% {
    transform: translate(-22px, 16px) scale(1.05);
  }
}

@keyframes plan-create-orb-float-c {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  50% {
    transform: translate(12px, -14px) scale(1.04);
  }
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

</style>
