# AI Plan 实施计划

> **给执行型智能体：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务逐项执行本计划。所有步骤使用复选框语法 `- [ ]` 进行追踪。

**目标：** 交付一个多用户 AI 计划管理网站，支持用户创建计划、按任务提交文字与图片证明，并由系统基于 AI 评分和可配置规则自动判定任务是否完成。

**架构：** 使用 `pnpm monorepo` 组织两个 `Vue 3 + TypeScript` 前端应用（`web-user`、`web-admin`）和一个 Node API（`api`）。AI 能力集中在 `packages/ai-engine`，输出必须满足严格的 JSON Schema，自动判定逻辑放在 API 内部规则引擎中。

**技术栈：** Vue 3、TypeScript、Vite、Pinia、Vue Router、Node.js、Fastify、Prisma、PostgreSQL、Zod、Vitest、Playwright、pnpm workspace。

---

## 文件结构

### Monorepo 根目录

- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`

### 共享包

- Create: `packages/shared/package.json`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/schemas.ts`
- Create: `packages/shared/src/constants.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/tests/schemas.test.ts`

### AI 引擎

- Create: `packages/ai-engine/package.json`
- Create: `packages/ai-engine/src/client.ts`
- Create: `packages/ai-engine/src/prompts.ts`
- Create: `packages/ai-engine/src/contracts.ts`
- Create: `packages/ai-engine/src/index.ts`
- Test: `packages/ai-engine/tests/contracts.test.ts`

### API 应用

- Create: `apps/api/package.json`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/plugins/auth.ts`
- Create: `apps/api/src/modules/auth/*.ts`
- Create: `apps/api/src/modules/plans/*.ts`
- Create: `apps/api/src/modules/submissions/*.ts`
- Create: `apps/api/src/modules/evaluation/*.ts`
- Create: `apps/api/src/modules/admin/*.ts`
- Create: `apps/api/src/modules/audit/*.ts`
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/*`
- Test: `apps/api/tests/*.test.ts`

### 用户端应用

- Create: `apps/web-user/package.json`
- Create: `apps/web-user/src/main.ts`
- Create: `apps/web-user/src/router/index.ts`
- Create: `apps/web-user/src/stores/*.ts`
- Create: `apps/web-user/src/features/plans/*`
- Create: `apps/web-user/src/features/submissions/*`
- Test: `apps/web-user/tests/*.test.ts`

### 管理后台应用

- Create: `apps/web-admin/package.json`
- Create: `apps/web-admin/src/main.ts`
- Create: `apps/web-admin/src/router/index.ts`
- Create: `apps/web-admin/src/features/dashboard/*`
- Create: `apps/web-admin/src/features/rules/*`
- Create: `apps/web-admin/src/features/submissions/*`
- Test: `apps/web-admin/tests/*.test.ts`

### 端到端测试与文档

- Create: `tests/e2e/user-flow.spec.ts`
- Create: `tests/e2e/admin-flow.spec.ts`
- Create: `docs/ops/metrics.md`
- Create: `docs/ops/runbook.md`

---

### 任务 1：搭建 Monorepo 与共享契约

**文件：**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `packages/shared/src/schemas.ts`
- Create: `packages/shared/tests/schemas.test.ts`

- [ ] **步骤 1：先写失败的契约测试**

```ts
// packages/shared/tests/schemas.test.ts
import { describe, expect, it } from 'vitest';
import { planCreateSchema } from '../src/schemas';

describe('planCreateSchema', () => {
  it('在缺少目标时应校验失败', () => {
    const result = planCreateSchema.safeParse({
      deadline: '2026-12-31',
      requirement: '完成作品集',
      type: 'general',
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **步骤 2：运行测试，确认它先失败**

运行：`pnpm --filter @ai-plan/shared test`  
预期：失败，提示找不到模块或 Schema。

- [ ] **步骤 3：实现共享 Schema 与工作区配置**

```ts
// packages/shared/src/schemas.ts
import { z } from 'zod';

export const planCreateSchema = z.object({
  goal: z.string().min(3),
  deadline: z.string().datetime({ offset: true }),
  requirement: z.string().min(5),
  type: z.enum(['general', 'study', 'work']),
});
```

- [ ] **步骤 4：再次运行测试，确认通过**

运行：`pnpm --filter @ai-plan/shared test`  
预期：通过，至少 1 个测试成功。

- [ ] **步骤 5：提交**

```bash
git add pnpm-workspace.yaml package.json tsconfig.base.json packages/shared
git commit -m "chore: bootstrap monorepo and shared validation contracts"
```

### 任务 2：建立数据库模型与核心持久化层

**文件：**
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/0001_init/migration.sql`
- Create: `apps/api/src/modules/plans/plan.repository.ts`
- Test: `apps/api/tests/plan-repository.test.ts`

- [ ] **步骤 1：先写失败的仓储测试**

```ts
// apps/api/tests/plan-repository.test.ts
import { describe, expect, it } from 'vitest';
import { createPlanRecord } from '../src/modules/plans/plan.repository';

describe('createPlanRecord', () => {
  it('应能创建计划记录', async () => {
    const plan = await createPlanRecord({
      userId: 'u1',
      goal: '完成产品演示',
      deadline: new Date('2026-09-01'),
      requirement: '交付 demo 和文档',
      type: 'general',
    });
    expect(plan.id).toBeTruthy();
  });
});
```

- [ ] **步骤 2：运行测试，确认它先失败**

运行：`pnpm --filter @ai-plan/api test plan-repository`  
预期：失败，提示找不到仓储实现。

- [ ] **步骤 3：实现 Prisma 模型与仓储层**

```prisma
model Plan {
  id          String   @id @default(cuid())
  userId      String
  goal        String
  deadline    DateTime
  requirement String
  type        String
  status      String   @default("active")
  stages      PlanStage[]
  createdAt   DateTime @default(now())
}
```

```ts
// apps/api/src/modules/plans/plan.repository.ts
export async function createPlanRecord(input: CreatePlanInput) {
  return prisma.plan.create({
    data: {
      userId: input.userId,
      goal: input.goal,
      deadline: input.deadline,
      requirement: input.requirement,
      type: input.type,
    },
  });
}
```

- [ ] **步骤 4：执行迁移并重新测试**

运行：`pnpm --filter @ai-plan/api prisma migrate dev --name init`  
运行：`pnpm --filter @ai-plan/api test plan-repository`  
预期：通过，仓储测试成功。

- [ ] **步骤 5：提交**

```bash
git add apps/api/prisma apps/api/src/modules/plans apps/api/tests/plan-repository.test.ts
git commit -m "feat(api): add core prisma schema and plan persistence"
```

### 任务 3：完成鉴权、RBAC 与会话流程

**文件：**
- Create: `apps/api/src/modules/auth/auth.routes.ts`
- Create: `apps/api/src/modules/auth/auth.service.ts`
- Create: `apps/api/src/plugins/auth.ts`
- Test: `apps/api/tests/auth-routes.test.ts`

- [ ] **步骤 1：先写失败的鉴权路由测试**

```ts
// apps/api/tests/auth-routes.test.ts
it('合法登录后应返回 JWT', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
  });
  expect(res.statusCode).toBe(200);
  expect(JSON.parse(res.body).token).toBeTypeOf('string');
});
```

- [ ] **步骤 2：运行测试，确认它先失败**

运行：`pnpm --filter @ai-plan/api test auth-routes`  
预期：失败，提示 `POST /auth/login` 不存在。

- [ ] **步骤 3：实现鉴权服务与角色守卫**

```ts
// apps/api/src/plugins/auth.ts
fastify.decorate('requireRole', (role: 'user' | 'admin') => async (req, reply) => {
  const payload = await req.jwtVerify<{ role: 'user' | 'admin' }>();
  if (payload.role !== role) return reply.code(403).send({ message: 'Forbidden' });
});
```

- [ ] **步骤 4：重新运行测试**

运行：`pnpm --filter @ai-plan/api test auth-routes`  
预期：通过，登录和受保护路由测试全部成功。

- [ ] **步骤 5：提交**

```bash
git add apps/api/src/modules/auth apps/api/src/plugins/auth.ts apps/api/tests/auth-routes.test.ts
git commit -m "feat(api): implement auth and RBAC guard"
```

### 任务 4：实现 AI 计划生成与有限编辑

**文件：**
- Create: `packages/ai-engine/src/client.ts`
- Create: `apps/api/src/modules/plans/plan.service.ts`
- Create: `apps/api/src/modules/plans/plan.routes.ts`
- Test: `apps/api/tests/plan-generation.test.ts`

- [ ] **步骤 1：先写失败的计划生成测试**

```ts
// apps/api/tests/plan-generation.test.ts
it('应能创建带阶段和任务的计划', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/plans',
    headers: { authorization: `Bearer ${userToken}` },
    payload: {
      goal: '通过英语考试',
      deadline: '2026-10-01T00:00:00.000Z',
      requirement: 'IELTS 7.0',
      type: 'study',
    },
  });
  expect(res.statusCode).toBe(201);
  const body = JSON.parse(res.body);
  expect(body.stages.length).toBeGreaterThan(0);
});
```

- [ ] **步骤 2：运行测试，确认它先失败**

运行：`pnpm --filter @ai-plan/api test plan-generation`  
预期：失败，因为 `POST /plans` 尚未实现。

- [ ] **步骤 3：实现 AI 生成流程与有限编辑策略**

```ts
// apps/api/src/modules/plans/plan.service.ts
const editableFields = ['deadline', 'note'] as const;

export function sanitizePlanPatch(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => editableFields.includes(key as (typeof editableFields)[number]))
  );
}
```

- [ ] **步骤 4：运行生成与编辑相关测试**

运行：`pnpm --filter @ai-plan/api test plan-generation`  
预期：通过，计划生成成功，且非允许字段的编辑被拒绝。

- [ ] **步骤 5：提交**

```bash
git add packages/ai-engine apps/api/src/modules/plans apps/api/tests/plan-generation.test.ts
git commit -m "feat(api): generate ai plans and enforce limited editing"
```

### 任务 5：实现提交上传与证据存储

**文件：**
- Create: `apps/api/src/modules/submissions/submission.routes.ts`
- Create: `apps/api/src/modules/submissions/submission.service.ts`
- Create: `apps/api/src/modules/storage/storage.service.ts`
- Test: `apps/api/tests/submission-upload.test.ts`

- [ ] **步骤 1：先写失败的提交测试**

```ts
// apps/api/tests/submission-upload.test.ts
it('应能提交文字与图片证据', async () => {
  const res = await app.inject({
    method: 'POST',
    url: `/tasks/${taskId}/submissions`,
    headers: { authorization: `Bearer ${userToken}` },
    payload: { content: '完成了第 1 章和第 2 章', imageUrls: ['https://cdn.test/1.png'] },
  });
  expect(res.statusCode).toBe(201);
});
```

- [ ] **步骤 2：运行测试，确认它先失败**

运行：`pnpm --filter @ai-plan/api test submission-upload`  
预期：失败，提示提交路由不存在。

- [ ] **步骤 3：实现提交接口与图片元数据存储**

```ts
// apps/api/src/modules/submissions/submission.service.ts
export async function createSubmission(input: CreateSubmissionInput) {
  return prisma.taskSubmission.create({
    data: {
      taskId: input.taskId,
      content: input.content,
      status: 'in_review',
      images: {
        createMany: {
          data: input.imageUrls.map((url) => ({ url, hash: hashUrl(url) })),
        },
      },
    },
    include: { images: true },
  });
}
```

- [ ] **步骤 4：重新运行上传测试**

运行：`pnpm --filter @ai-plan/api test submission-upload`  
预期：通过，同时覆盖空内容或零图片时的校验失败场景。

- [ ] **步骤 5：提交**

```bash
git add apps/api/src/modules/submissions apps/api/src/modules/storage apps/api/tests/submission-upload.test.ts
git commit -m "feat(api): add task submission with text and image evidence"
```

### 任务 6：实现 AI 评分、规则引擎与自动判定

**文件：**
- Create: `apps/api/src/modules/evaluation/evaluation.service.ts`
- Create: `apps/api/src/modules/evaluation/rules.engine.ts`
- Create: `apps/api/src/modules/evaluation/evaluation.worker.ts`
- Test: `apps/api/tests/auto-judgment.test.ts`

- [ ] **步骤 1：先写失败的自动判定测试**

```ts
// apps/api/tests/auto-judgment.test.ts
it('当分数和风险满足阈值时应标记为完成', async () => {
  const status = decideStatus({
    totalScore: 86,
    riskScore: 24,
    evidenceCount: 2,
    minEvidenceCount: 1,
  });
  expect(status).toBe('completed');
});
```

- [ ] **步骤 2：运行测试，确认它先失败**

运行：`pnpm --filter @ai-plan/api test auto-judgment`  
预期：失败，因为 `decideStatus` 尚未实现。

- [ ] **步骤 3：实现规则引擎与评分落库**

```ts
// apps/api/src/modules/evaluation/rules.engine.ts
export function decideStatus(input: DecideStatusInput): 'completed' | 'needs_retry' {
  const isPassed =
    input.totalScore >= 80 &&
    input.riskScore <= 30 &&
    input.evidenceCount >= input.minEvidenceCount;
  return isPassed ? 'completed' : 'needs_retry';
}
```

- [ ] **步骤 4：重新运行规则与集成测试**

运行：`pnpm --filter @ai-plan/api test auto-judgment`  
预期：通过，阈值与边界场景全部成功。

- [ ] **步骤 5：提交**

```bash
git add apps/api/src/modules/evaluation apps/api/tests/auto-judgment.test.ts
git commit -m "feat(api): implement ai evaluation and auto-judgment rule engine"
```

### 任务 7：完成用户端登录与计划管理页面

**文件：**
- Create: `apps/web-user/src/router/index.ts`
- Create: `apps/web-user/src/features/auth/LoginPage.vue`
- Create: `apps/web-user/src/features/plans/PlanCreatePage.vue`
- Create: `apps/web-user/src/features/plans/PlanDetailPage.vue`
- Test: `apps/web-user/tests/plan-create-page.test.ts`

- [ ] **步骤 1：先写失败的页面测试**

```ts
// apps/web-user/tests/plan-create-page.test.ts
it('提交创建计划表单后应跳转到详情页', async () => {
  render(PlanCreatePage);
  await userEvent.type(screen.getByLabelText('目标'), '三个月完成作品集');
  await userEvent.click(screen.getByRole('button', { name: '生成计划' }));
  expect(mockRouterPush).toHaveBeenCalled();
});
```

- [ ] **步骤 2：运行测试，确认它先失败**

运行：`pnpm --filter @ai-plan/web-user test plan-create-page`  
预期：失败，因为页面组件或路由逻辑还不存在。

- [ ] **步骤 3：实现鉴权守卫与计划创建/详情页**

```ts
// apps/web-user/src/router/index.ts
router.beforeEach((to) => {
  if (to.meta.requiresAuth && !authStore.token) return '/auth/login';
});
```

- [ ] **步骤 4：运行用户端测试**

运行：`pnpm --filter @ai-plan/web-user test`  
预期：通过，创建流程和鉴权守卫测试成功。

- [ ] **步骤 5：提交**

```bash
git add apps/web-user/src apps/web-user/tests
git commit -m "feat(web-user): add auth flow and plan management pages"
```

### 任务 8：完成用户提交与结果展示体验

**文件：**
- Create: `apps/web-user/src/features/submissions/TaskSubmitPage.vue`
- Create: `apps/web-user/src/features/submissions/SubmissionResultPage.vue`
- Create: `apps/web-user/src/features/submissions/submission.api.ts`
- Test: `apps/web-user/tests/submission-flow.test.ts`

- [ ] **步骤 1：先写失败的提交流程测试**

```ts
// apps/web-user/tests/submission-flow.test.ts
it('上传证据后应展示分数与缺失项', async () => {
  render(TaskSubmitPage);
  await userEvent.type(screen.getByLabelText('完成说明'), '完成第 1 阶段任务');
  await userEvent.upload(screen.getByLabelText('上传图片'), file);
  await userEvent.click(screen.getByRole('button', { name: '提交审核' }));
  expect(mockNavigate).toHaveBeenCalledWith('/submissions/s1/result');
});
```

- [ ] **步骤 2：运行测试，确认它先失败**

运行：`pnpm --filter @ai-plan/web-user test submission-flow`  
预期：失败，因为提交页和结果页尚未实现。

- [ ] **步骤 3：实现提交表单与结果展示**

```ts
// apps/web-user/src/features/submissions/submission.api.ts
export async function createSubmission(taskId: string, payload: SubmissionPayload) {
  return http.post(`/tasks/${taskId}/submissions`, payload);
}
```

- [ ] **步骤 4：重新运行测试**

运行：`pnpm --filter @ai-plan/web-user test submission-flow`  
预期：通过，提交流程与结果渲染场景全部成功。

- [ ] **步骤 5：提交**

```bash
git add apps/web-user/src/features/submissions apps/web-user/tests/submission-flow.test.ts
git commit -m "feat(web-user): implement task submission and evaluation result pages"
```

### 任务 9：完成管理后台总览、规则配置与审计视图

**文件：**
- Create: `apps/web-admin/src/features/dashboard/DashboardPage.vue`
- Create: `apps/web-admin/src/features/rules/RulesPage.vue`
- Create: `apps/web-admin/src/features/submissions/SubmissionListPage.vue`
- Create: `apps/api/src/modules/admin/admin.routes.ts`
- Test: `apps/web-admin/tests/rules-page.test.ts`
- Test: `apps/api/tests/admin-routes.test.ts`

- [ ] **步骤 1：先写失败的后台测试**

```ts
// apps/api/tests/admin-routes.test.ts
it('普通用户读取规则配置时应被拒绝', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/admin/rules',
    headers: { authorization: `Bearer ${userToken}` },
  });
  expect(res.statusCode).toBe(403);
});
```

- [ ] **步骤 2：运行测试，确认它先失败**

运行：`pnpm --filter @ai-plan/api test admin-routes`  
运行：`pnpm --filter @ai-plan/web-admin test rules-page`  
预期：失败，因为后台路由和页面尚未实现。

- [ ] **步骤 3：实现后台 API 与前端页面**

```ts
// apps/api/src/modules/admin/admin.routes.ts
fastify.get('/admin/rules', { preHandler: fastify.requireRole('admin') }, async () => {
  return prisma.ruleConfig.findMany();
});
```

- [ ] **步骤 4：重新运行后台相关测试**

运行：`pnpm --filter @ai-plan/api test admin-routes`  
运行：`pnpm --filter @ai-plan/web-admin test`  
预期：通过，权限控制和规则页交互测试成功。

- [ ] **步骤 5：提交**

```bash
git add apps/api/src/modules/admin apps/web-admin/src apps/web-admin/tests apps/api/tests/admin-routes.test.ts
git commit -m "feat(admin): add dashboard, rule management, and audit views"
```

### 任务 10：补齐端到端流程、监控指标与发布准备

**文件：**
- Create: `tests/e2e/user-flow.spec.ts`
- Create: `tests/e2e/admin-flow.spec.ts`
- Create: `apps/api/src/plugins/metrics.ts`
- Create: `docs/ops/metrics.md`
- Create: `docs/ops/runbook.md`

- [ ] **步骤 1：先写失败的 E2E 冒烟测试**

```ts
// tests/e2e/user-flow.spec.ts
test('用户可以创建计划并提交证据', async ({ page }) => {
  await page.goto('/auth/login');
  await page.fill('input[name="email"]', 'demo@ai-plan.dev');
  await page.fill('input[name="password"]', 'Pass1234!');
  await page.click('button:has-text("登录")');
  await expect(page).toHaveURL(/plans/);
});
```

- [ ] **步骤 2：运行 E2E，确认它先失败**

运行：`pnpm test:e2e`  
预期：失败，因为整套系统联通尚未完成。

- [ ] **步骤 3：补充监控插件与运维文档**

```ts
// apps/api/src/plugins/metrics.ts
export function recordEvaluationLatency(ms: number) {
  evaluationLatencyHistogram.observe(ms);
}
```

- [ ] **步骤 4：做完整验证**

运行：`pnpm lint`  
运行：`pnpm test`  
运行：`pnpm test:e2e`  
预期：全部通过，无 lint 错误，测试全绿。

- [ ] **步骤 5：提交**

```bash
git add tests/e2e apps/api/src/plugins/metrics.ts docs/ops
git commit -m "chore: add e2e coverage, metrics, and release runbook"
```

---

## 自检

### 1. 规格覆盖检查

- 多用户鉴权与角色体系：由任务 3 和任务 9 覆盖。
- AI 计划生成与优化入口：由任务 4 覆盖。
- 有限编辑能力：由任务 4 覆盖。
- 文字 + 图片提交：由任务 5 和任务 8 覆盖。
- AI 评分与规则自动判定：由任务 6 覆盖。
- 管理后台、规则配置与审计查看：由任务 9 覆盖。
- 可观测性与上线准备：由任务 10 覆盖。

设计稿 `2026-04-08-ai-plan-design.md` 中的需求没有遗漏项。

### 2. 占位项扫描

- 文档中没有占位标记或“后续再补”的空泛描述。
- 每个任务都包含明确文件路径、执行命令、预期结果和提交命令。

### 3. 类型与命名一致性检查

- 任务状态统一为 `pending`、`in_review`、`completed`、`needs_retry`。
- AI 阈值保持一致：`totalScore >= 80`、`riskScore <= 30`。
- 角色名称统一为 `user` 与 `admin`。

