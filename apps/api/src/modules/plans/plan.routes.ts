import { PassThrough } from 'node:stream';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import {
  compareDraftVersions,
  confirmPlanVersion,
  createGeneratedPlan,
  getPlanDraft,
  getPlanWithDraft,
  regeneratePlanVersion,
  sanitizePlanPatch,
  updatePlanV1Requirement,
} from './plan.service';
import { completeDeepseekChat, isDeepseekConfigured, streamDeepseekChat } from '../../lib/deepseek';
import { generatePlanDraft } from '@ai-plan/ai-engine/client';
import mammoth from 'mammoth';

const planTypes = ['general', 'study', 'work'] as const;
const planModes = ['basic', 'pro'] as const;
const levels = ['none', 'newbie', 'junior', 'intermediate', 'advanced'] as const;
const cycles = ['1w', '1m', '3m', '6m', 'custom'] as const;
const outputModes = ['daily', 'phase-weekly', 'phase-monthly'] as const;
const aiDepths = ['basic', 'advanced'] as const;
const reminderModes = ['standard', 'smart'] as const;
const granularityModes = ['smart', 'deep', 'rough'] as const;

type PlanType = (typeof planTypes)[number];
type PlanMode = (typeof planModes)[number];
type Level = (typeof levels)[number];
type Cycle = (typeof cycles)[number];
type OutputMode = (typeof outputModes)[number];
type AiDepth = (typeof aiDepths)[number];
type ReminderMode = (typeof reminderModes)[number];
type GranularityMode = (typeof granularityModes)[number];
type AssistantMode = 'draft' | 'chat';

type PlanAssistantBody = {
  mode: AssistantMode;
  goal: string;
  requirement: string;
  startDate: string;
  cycle: Cycle;
  endDate: string;
  message?: string;
};

type ParsePlanFileBody = {
  fileName: string;
  contentBase64: string;
};

type ConfirmPlanVersionBody = {
  version: number;
};

type CreatePlanBody = {
  goal: string;
  deadline: string;
  requirement: string;
  type: PlanType;
  profile?: {
    planMode: PlanMode;
    basicInfo: {
      planName: string;
      planContent: string;
      currentLevel: Level;
      startDate: string;
      cycle: Cycle;
      endDate: string;
      preference: string;
      timeInvestment: string;
      outputMode: OutputMode;
      granularityMode?: GranularityMode;
    };
    proSettings?: {
      aiDepth: AiDepth;
      reminderMode: ReminderMode;
    };
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeBody(raw: unknown) {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

function isOneOf<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === 'string' && values.includes(value);
}

function validateCreatePlanBody(raw: unknown): { ok: true; data: CreatePlanBody } | { ok: false; message: string } {
  raw = normalizeBody(raw);
  if (!isRecord(raw)) return { ok: false, message: 'Invalid request body' };

  if (!isNonEmptyString(raw.goal)) return { ok: false, message: 'goal is required' };
  if (!isNonEmptyString(raw.requirement)) return { ok: false, message: 'requirement is required' };
  if (!isDateString(raw.deadline)) return { ok: false, message: 'deadline must be a valid date string' };
  if (!isOneOf(raw.type, planTypes)) return { ok: false, message: 'type is invalid' };
  // profile is optional metadata for enhanced generation experience.
  // To keep /plans creation highly available across client versions,
  // profile shape mismatches will be tolerated and ignored by route logic.

  return { ok: true, data: raw as CreatePlanBody };
}

function validateAssistantBody(raw: unknown): { ok: true; data: PlanAssistantBody } | { ok: false; message: string } {
  raw = normalizeBody(raw);
  if (!isRecord(raw)) return { ok: false, message: 'Invalid request body' };
  if (!isOneOf(raw.mode, ['draft', 'chat'] as const)) return { ok: false, message: 'mode is invalid' };
  if (!isNonEmptyString(raw.goal)) return { ok: false, message: 'goal is required' };
  if (typeof raw.requirement !== 'string') return { ok: false, message: 'requirement must be a string' };
  if (!isDateString(raw.startDate)) return { ok: false, message: 'startDate must be a valid date string' };
  if (!isOneOf(raw.cycle, cycles)) return { ok: false, message: 'cycle is invalid' };
  if (!isDateString(raw.endDate)) return { ok: false, message: 'endDate must be a valid date string' };
  if (raw.mode === 'chat' && !isNonEmptyString(raw.message)) return { ok: false, message: 'message is required in chat mode' };
  if (raw.cycle === 'custom' && new Date(raw.endDate).getTime() < new Date(raw.startDate).getTime()) {
    return { ok: false, message: 'endDate must be >= startDate for custom cycle' };
  }
  return { ok: true, data: raw as PlanAssistantBody };
}

type AssistantDraftStreamBody = {
  assistantPrompt: string;
  startDate: string;
  cycle: Cycle;
  endDate: string;
};

function validateAssistantDraftStreamBody(
  raw: unknown,
): { ok: true; data: AssistantDraftStreamBody } | { ok: false; message: string } {
  raw = normalizeBody(raw);
  if (!isRecord(raw)) return { ok: false, message: 'Invalid request body' };
  if (typeof raw.assistantPrompt !== 'string') return { ok: false, message: 'assistantPrompt must be a string' };
  if (!raw.assistantPrompt.trim()) return { ok: false, message: 'assistantPrompt is required' };
  if (raw.assistantPrompt.length > 120_000) return { ok: false, message: 'assistantPrompt is too large' };
  if (!isDateString(raw.startDate)) return { ok: false, message: 'startDate must be a valid date string' };
  if (!isOneOf(raw.cycle, cycles)) return { ok: false, message: 'cycle is invalid' };
  if (!isDateString(raw.endDate)) return { ok: false, message: 'endDate must be a valid date string' };
  if (raw.cycle === 'custom' && new Date(raw.endDate).getTime() < new Date(raw.startDate).getTime()) {
    return { ok: false, message: 'endDate must be >= startDate for custom cycle' };
  }
  return {
    ok: true,
    data: {
      assistantPrompt: raw.assistantPrompt,
      startDate: raw.startDate,
      cycle: raw.cycle,
      endDate: raw.endDate,
    },
  };
}

function validateParsePlanFileBody(raw: unknown): { ok: true; data: ParsePlanFileBody } | { ok: false; message: string } {
  raw = normalizeBody(raw);
  if (!isRecord(raw)) return { ok: false, message: 'Invalid request body' };
  if (!isNonEmptyString(raw.fileName)) return { ok: false, message: 'fileName is required' };
  if (!isNonEmptyString(raw.contentBase64)) return { ok: false, message: 'contentBase64 is required' };
  return { ok: true, data: raw as ParsePlanFileBody };
}

function validateConfirmPlanVersionBody(raw: unknown): { ok: true; data: ConfirmPlanVersionBody } | { ok: false; message: string } {
  raw = normalizeBody(raw);
  if (!isRecord(raw)) return { ok: false, message: 'Invalid request body' };
  if (typeof raw.version !== 'number' || !Number.isInteger(raw.version) || raw.version < 1) {
    return { ok: false, message: 'version must be a positive integer' };
  }
  return { ok: true, data: raw as ConfirmPlanVersionBody };
}

function getFileExtension(fileName: string) {
  const index = fileName.lastIndexOf('.');
  if (index < 0) return '';
  return fileName.slice(index + 1).toLowerCase();
}

function sanitizeTextContent(content: string) {
  return content.replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim();
}

const DEEPSEEK_SYSTEM =
  '你是「计划大师」的 AI 计划顾问。根据用户给出的信息与要求，用中文输出可直接作为「计划内容」保存的正文：务实用语、分阶段目标与验收、可执行任务（优先按周，必要时到天）、风险与应对、复盘建议。不要输出与计划无关的寒暄。';

async function tryDeepseekAssistant(
  log: FastifyBaseLogger,
  body: PlanAssistantBody,
  localDraftText: string,
): Promise<{ reply: string; suggestedContent: string } | null> {
  if (!isDeepseekConfigured()) return null;

  try {
    if (body.mode === 'draft') {
      const userContent =
        body.requirement.trim().length > 0
          ? body.requirement
          : `请根据以下目标生成计划：${body.goal}\n起始：${body.startDate}，预计完成：${body.endDate}，周期代码：${body.cycle}`;
      const suggestedContent = await completeDeepseekChat([
        { role: 'system', content: DEEPSEEK_SYSTEM },
        { role: 'user', content: userContent },
      ]);
      return {
        reply: '已通过 DeepSeek 生成计划初稿，你可继续调整说明后再次提交或直接使用。',
        suggestedContent,
      };
    }

    const userContent = `【当前计划内容】\n${body.requirement || '（暂无）'}\n\n【用户补充】\n${body.message}`;
    const suggestedContent = await completeDeepseekChat([
      {
        role: 'system',
        content: `${DEEPSEEK_SYSTEM} 用户会提出补充，请输出合并、润色后的完整计划正文。`,
      },
      { role: 'user', content: userContent },
    ]);
    return {
      reply: '已根据你的补充更新了计划内容（DeepSeek）。',
      suggestedContent,
    };
  } catch (err) {
    log.warn({ err }, 'DeepSeek plan assistant failed; falling back to local draft');
    return {
      reply:
        body.mode === 'draft'
          ? 'AI 服务暂时不可用，已使用本地模板生成初稿；配置 DEEPSEEK_API_KEY 后可启用云端生成。'
          : 'AI 服务暂时不可用，已把你的补充直接合并进正文；可稍后重试。',
      suggestedContent: body.mode === 'draft' ? localDraftText : `${body.requirement}\n\n用户补充：${body.message}`,
    };
  }
}

function formatDraftToText(params: { goal: string; startDate: string; endDate: string; cycle: Cycle; requirement: string }) {
  const draft = generatePlanDraft({
    goal: params.goal,
    deadline: new Date(`${params.endDate}T00:00:00.000Z`).toISOString(),
    requirement: params.requirement || '暂无补充说明',
    type: 'general',
  });
  const stageLines = draft.stages
    .map((stage) => {
      const tasks = stage.tasks.map((task) => `  - ${task.title}`).join('\n');
      return `【${stage.sortOrder}. ${stage.name}】\n${tasks}`;
    })
    .join('\n\n');

  return [
    `目标：${params.goal}`,
    `起始时间：${params.startDate}`,
    `预计完成：${params.endDate}`,
    `周期：${params.cycle}`,
    '',
    stageLines,
  ].join('\n');
}

export async function registerPlanRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/plans',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const parsed = validateCreatePlanBody(request.body);
      if (!parsed.ok) {
        return reply.code(400).send({ message: parsed.message });
      }

      const body = parsed.data;
      const payload = await request.jwtVerify<{ sub: string }>();
      const granularityMode = isOneOf(body.profile?.basicInfo?.granularityMode, granularityModes)
        ? body.profile?.basicInfo?.granularityMode
        : undefined;
      const startDateIso = body.profile?.basicInfo?.startDate
        ? new Date(`${body.profile.basicInfo.startDate}T00:00:00.000Z`).toISOString()
        : body.deadline;
      const plan = await createGeneratedPlan({
        userId: payload.sub,
        goal: body.goal,
        deadline: body.deadline,
        requirement: body.requirement,
        type: body.type,
        granularityMode,
        startDateIso,
      });

      return reply.code(201).send(plan);
    }
  );

  fastify.patch(
    '/plans/:id',
    { preHandler: fastify.requireRole('user') },
    async (request) => {
      const body = request.body as Record<string, unknown> | undefined;
      return sanitizePlanPatch(body ?? {});
    }
  );

  fastify.get(
    '/plans/:id',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      const { id } = request.params as { id: string };
      const plan = await getPlanWithDraft(id, payload.sub);
      if (!plan) return reply.code(404).send({ message: 'plan not found' });
      return reply.send(plan);
    }
  );

  fastify.get(
    '/plans/:id/draft',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      const { id } = request.params as { id: string };
      const result = await getPlanDraft(id, payload.sub);
      if (!result.ok) return reply.code(result.code).send({ message: result.message });
      return reply.send(result.draft);
    }
  );

  fastify.post(
    '/plans/:id/regenerate',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      const { id } = request.params as { id: string };
      const body = normalizeBody(request.body);
      const requirement = isRecord(body) && typeof body.requirement === 'string' ? body.requirement : undefined;
      const granularityMode =
        isRecord(body) && isOneOf(body.granularityMode, granularityModes) ? body.granularityMode : undefined;
      const result = await regeneratePlanVersion(id, payload.sub, requirement, granularityMode);
      if (!result.ok) return reply.code(result.code).send({ message: result.message });
      return reply.send({
        versions: result.state.versions,
        maxVersions: result.state.maxVersions,
        confirmedVersion: result.state.confirmedVersion,
        canRegenerate: result.state.versions.length < result.state.maxVersions,
      });
    }
  );

  fastify.post(
    '/plans/:id/confirm',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const parsed = validateConfirmPlanVersionBody(request.body);
      if (!parsed.ok) return reply.code(400).send({ message: parsed.message });
      const payload = await request.jwtVerify<{ sub: string }>();
      const { id } = request.params as { id: string };
      const result = await confirmPlanVersion(id, payload.sub, parsed.data.version);
      if (!result.ok) return reply.code(result.code).send({ message: result.message });
      return reply.send({
        plan: result.plan,
        confirmedVersion: result.state.confirmedVersion,
      });
    }
  );

  fastify.get(
    '/plans/:id/compare',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const query = request.query as { base?: string; target?: string };
      const baseVersion = Number(query.base);
      const targetVersion = Number(query.target);
      if (!Number.isInteger(baseVersion) || !Number.isInteger(targetVersion) || baseVersion < 1 || targetVersion < 1) {
        return reply.code(400).send({ message: 'base and target must be positive integers' });
      }
      const diff = await compareDraftVersions(id, baseVersion, targetVersion);
      if (!diff) return reply.code(404).send({ message: 'compare versions not found' });
      return reply.send(diff);
    }
  );

  fastify.post(
    '/plans/:id/assistant-draft-stream',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = validateAssistantDraftStreamBody(request.body);
      if (!parsed.ok) {
        return reply.code(400).send({ message: parsed.message });
      }
      const streamInput = parsed.data;
      const payload = await request.jwtVerify<{ sub: string }>();
      const plan = await getPlanWithDraft(id, payload.sub);
      if (!plan) {
        return reply.code(404).send({ message: 'plan not found' });
      }
      if (plan.status !== 'draft') {
        return reply.code(409).send({ message: 'draft is closed' });
      }

      const abort = new AbortController();
      const onClose = () => abort.abort();
      request.raw.socket?.once('close', onClose);

      const pass = new PassThrough();
      reply
        .header('Content-Type', 'text/event-stream; charset=utf-8')
        .header('Cache-Control', 'no-cache, no-transform')
        .header('Connection', 'keep-alive')
        .header('X-Accel-Buffering', 'no');
      reply.send(pass);
      /** 立即推一行 SSE 注释，便于浏览器/DevTools 识别为 EventStream 并尽早建立流 */
      pass.write(': stream\n\n');

      const writeEv = (obj: unknown) => {
        pass.write(`data: ${JSON.stringify(obj)}\n\n`);
      };

      void (async () => {
        let full = '';
        try {
          if (isDeepseekConfigured()) {
            for await (const chunk of streamDeepseekChat(
              [
                { role: 'system', content: DEEPSEEK_SYSTEM },
                { role: 'user', content: streamInput.assistantPrompt.trim() },
              ],
              { signal: abort.signal },
            )) {
              full += chunk;
              writeEv({ type: 'delta', text: chunk });
            }
          } else {
            full = formatDraftToText({
              goal: plan.goal,
              startDate: streamInput.startDate,
              endDate: streamInput.endDate,
              cycle: streamInput.cycle,
              requirement: plan.requirement,
            });
            writeEv({ type: 'delta', text: full });
          }

          const upd = await updatePlanV1Requirement(id, payload.sub, full);
          if (upd.ok) {
            writeEv({ type: 'done', ok: true });
          } else {
            writeEv({ type: 'error', message: upd.message });
          }
        } catch (err) {
          request.log.warn({ err }, 'assistant-draft-stream failed');
          writeEv({
            type: 'error',
            message: err instanceof Error ? err.message : 'stream failed',
          });
        } finally {
          request.raw.socket?.off('close', onClose);
          pass.end();
        }
      })();
    }
  );

  fastify.post(
    '/plans/assistant',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const parsed = validateAssistantBody(request.body);
      if (!parsed.ok) {
        return reply.code(400).send({ message: parsed.message });
      }

      const body = parsed.data;
      const draftText = formatDraftToText({
        goal: body.goal,
        startDate: body.startDate,
        endDate: body.endDate,
        cycle: body.cycle,
        requirement: body.requirement,
      });

      const deepseekResult = await tryDeepseekAssistant(request.log, body, draftText);
      if (deepseekResult) {
        return reply.send(deepseekResult);
      }

      if (body.mode === 'draft') {
        return reply.send({
          reply: '我已基于你的基础信息生成初稿，你可以继续对话让我细化成每周/每日执行版本。',
          suggestedContent: draftText,
        });
      }

      const merged = `${body.requirement}\n\n用户补充：${body.message}`;
      return reply.send({
        reply: '收到，我已将你的补充合并进计划内容。是否需要我再拆分为更细的每周任务清单？',
        suggestedContent: merged,
      });
    }
  );

  fastify.post(
    '/plans/parse-file',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const parsed = validateParsePlanFileBody(request.body);
      if (!parsed.ok) {
        return reply.code(400).send({ message: parsed.message });
      }

      const { fileName, contentBase64 } = parsed.data;
      const extension = getFileExtension(fileName);
      const allowedExtensions = ['txt', 'md', 'markdown', 'doc', 'docx'];
      if (!allowedExtensions.includes(extension)) {
        return reply.code(400).send({ message: 'file extension is not supported' });
      }

      const buffer = Buffer.from(contentBase64, 'base64');
      let extractedText = '';

      if (extension === 'txt' || extension === 'md' || extension === 'markdown') {
        extractedText = sanitizeTextContent(buffer.toString('utf8'));
      } else if (extension === 'docx') {
        const result = await mammoth.extractRawText({ buffer });
        extractedText = sanitizeTextContent(result.value);
      } else {
        extractedText = sanitizeTextContent(buffer.toString('utf8'));
      }

      if (!extractedText) {
        return reply.code(422).send({ message: 'failed to extract readable text from file' });
      }

      return reply.send({
        text: extractedText,
      });
    }
  );
}
