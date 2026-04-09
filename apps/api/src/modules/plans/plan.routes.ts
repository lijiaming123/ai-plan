import type { FastifyInstance } from 'fastify';
import {
  compareDraftVersions,
  confirmPlanVersion,
  createGeneratedPlan,
  getPlanWithDraft,
  regeneratePlanVersion,
  sanitizePlanPatch,
} from './plan.service';
import { generatePlanDraft } from '@ai-plan/ai-engine/client';
import mammoth from 'mammoth';

const planTypes = ['general', 'study', 'work'] as const;
const planModes = ['basic', 'pro'] as const;
const levels = ['none', 'newbie', 'junior', 'intermediate', 'advanced'] as const;
const cycles = ['1w', '1m', '3m', '6m', 'custom'] as const;
const outputModes = ['daily', 'phase-weekly', 'phase-monthly'] as const;
const aiDepths = ['basic', 'advanced'] as const;
const reminderModes = ['standard', 'smart'] as const;

type PlanType = (typeof planTypes)[number];
type PlanMode = (typeof planModes)[number];
type Level = (typeof levels)[number];
type Cycle = (typeof cycles)[number];
type OutputMode = (typeof outputModes)[number];
type AiDepth = (typeof aiDepths)[number];
type ReminderMode = (typeof reminderModes)[number];
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
      const plan = await createGeneratedPlan({
        userId: payload.sub,
        goal: body.goal,
        deadline: body.deadline,
        requirement: body.requirement,
        type: body.type,
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

  fastify.post(
    '/plans/:id/regenerate',
    { preHandler: fastify.requireRole('user') },
    async (request, reply) => {
      const payload = await request.jwtVerify<{ sub: string }>();
      const { id } = request.params as { id: string };
      const body = normalizeBody(request.body);
      const requirement = isRecord(body) && typeof body.requirement === 'string' ? body.requirement : undefined;
      const result = await regeneratePlanVersion(id, payload.sub, requirement);
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
