# Plan Draft Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把“创建计划后进入草稿页对比与确认”的流程落地，并保证确认后删除其他草稿、且正式计划不能回到草稿页。  

**Architecture:** 后端以 `Plan(status/currentVersion/confirmedVersion)` + `PlanVersion` 持久化版本。新增草稿读取专用接口并在确认接口内事务化清理草稿。前端增加 `/plans/:id/draft` 视图，使用“并排多卡 + 卡片内滚动 + 全局确认/重生成 + 二次确认弹窗”交互，并在计划 `active` 时强制跳转正式详情页。  

**Tech Stack:** Vue 3 + Vue Router + TypeScript + Vitest, Fastify + Prisma + PostgreSQL。

---

## File Structure Map

- Modify: `apps/api/src/modules/plans/plan.service.ts`（确认事务清理、草稿读取约束）
- Modify: `apps/api/src/modules/plans/plan.routes.ts`（新增 `/plans/:id/draft`，active 拦截）
- Modify: `apps/api/tests/plan-generation.test.ts`（后端行为测试）
- Modify: `apps/web-user/src/lib/api-client.ts`（新增 `getPlanDraft`）
- Modify: `apps/web-user/src/router/index.ts`（新增草稿路由）
- Create: `apps/web-user/src/features/plans/PlanDraftPage.vue`（并排草稿页）
- Modify: `apps/web-user/src/features/plans/PlanCreatePage.vue`（创建后跳转草稿页）
- Modify: `apps/web-user/src/features/plans/PlanDetailPage.vue`（保留为正式执行详情）
- Modify: `apps/web-user/tests/plan-create-page.test.ts`（创建后跳转行为）
- Create: `apps/web-user/tests/plan-draft-page.test.ts`（草稿页交互测试）

---

### Task 1: 后端先写失败测试（确认即删草稿 + active 禁止访问草稿）

**Files:**
- Modify: `apps/api/tests/plan-generation.test.ts`
- Test: `apps/api/tests/plan-generation.test.ts`

- [ ] **Step 1: 写失败测试：确认后删除其他草稿**

```ts
it('确认版本后应删除其他草稿版本', async () => {
  const create = await app.inject({ method: 'POST', url: '/plans', headers: { authorization: `Bearer ${token}` }, payload: basePayload });
  const plan = JSON.parse(create.body) as { id: string };
  await app.inject({ method: 'POST', url: `/plans/${plan.id}/regenerate`, headers: { authorization: `Bearer ${token}` }, payload: {} });
  await app.inject({ method: 'POST', url: `/plans/${plan.id}/confirm`, headers: { authorization: `Bearer ${token}` }, payload: { version: 2 } });

  const draftRead = await app.inject({ method: 'GET', url: `/plans/${plan.id}/draft`, headers: { authorization: `Bearer ${token}` } });
  expect(draftRead.statusCode).toBe(409);
});
```

- [ ] **Step 2: 写失败测试：active 不能回草稿页**

```ts
it('active 计划访问草稿接口应被拒绝', async () => {
  const create = await app.inject({ method: 'POST', url: '/plans', headers: { authorization: `Bearer ${token}` }, payload: basePayload });
  const plan = JSON.parse(create.body) as { id: string };
  await app.inject({ method: 'POST', url: `/plans/${plan.id}/confirm`, headers: { authorization: `Bearer ${token}` }, payload: { version: 1 } });

  const draftRead = await app.inject({ method: 'GET', url: `/plans/${plan.id}/draft`, headers: { authorization: `Bearer ${token}` } });
  expect(draftRead.statusCode).toBe(409);
  expect(JSON.parse(draftRead.body).message).toContain('draft is closed');
});
```

- [ ] **Step 3: 运行测试，确认失败**

Run: `corepack pnpm test -- plan-generation.test.ts`  
Expected: 至少 1-2 个新增用例 FAIL（接口未实现/行为不符）。

- [ ] **Step 4: Commit**

```bash
git add apps/api/tests/plan-generation.test.ts
git commit -m "test(api): cover draft close and cleanup rules"
```

---

### Task 2: 实现后端草稿关闭与清理事务

**Files:**
- Modify: `apps/api/src/modules/plans/plan.service.ts`
- Modify: `apps/api/src/modules/plans/plan.routes.ts`
- Test: `apps/api/tests/plan-generation.test.ts`

- [ ] **Step 1: 在 service 中实现确认事务清理逻辑**

```ts
export async function confirmPlanVersion(planId: string, userId: string, version: number) {
  const plan = await prisma.plan.findFirst({ where: { id: planId, userId } });
  if (!plan) return { ok: false as const, code: 404 as const, message: 'plan not found' };
  if (plan.status === 'active') return { ok: false as const, code: 409 as const, message: 'draft is closed' };

  const state = await loadDraftState(plan);
  const snapshot = state.versions.find((item) => item.version === version);
  if (!snapshot) return { ok: false as const, code: 404 as const, message: 'version not found' };

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.plan.update({
      where: { id: planId },
      data: {
        status: 'active',
        currentVersion: version,
        confirmedVersion: version,
        requirement: snapshot.requirement,
        deadline: new Date(snapshot.deadline),
      },
    });

    await tx.planVersion.deleteMany({
      where: { planId, NOT: { version } },
    });
    return next;
  });

  return { ok: true as const, plan: updated, state: { ...state, versions: state.versions.filter((v) => v.version === version), confirmedVersion: version } };
}
```

- [ ] **Step 2: 在 service 添加草稿专用读取（active 返回关闭）**

```ts
export async function getDraftPlanWithGuard(planId: string, userId: string) {
  const plan = await prisma.plan.findFirst({ where: { id: planId, userId } });
  if (!plan) return { ok: false as const, code: 404 as const, message: 'plan not found' };
  if (plan.status === 'active') return { ok: false as const, code: 409 as const, message: 'draft is closed' };

  const draft = await loadDraftState(plan);
  return {
    ok: true as const,
    plan: {
      ...plan,
      draft: {
        versions: draft.versions,
        maxVersions: draft.maxVersions,
        confirmedVersion: draft.confirmedVersion,
        canRegenerate: draft.versions.length < draft.maxVersions,
      },
    },
  };
}
```

- [ ] **Step 3: 在 routes 暴露 `GET /plans/:id/draft`**

```ts
fastify.get('/plans/:id/draft', { preHandler: fastify.requireRole('user') }, async (request, reply) => {
  const payload = await request.jwtVerify<{ sub: string }>();
  const { id } = request.params as { id: string };
  const result = await getDraftPlanWithGuard(id, payload.sub);
  if (!result.ok) return reply.code(result.code).send({ message: result.message });
  return reply.send(result.plan);
});
```

- [ ] **Step 4: 运行后端测试确认通过**

Run: `corepack pnpm test -- plan-generation.test.ts`  
Expected: PASS（含新增用例）。

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/plans/plan.service.ts apps/api/src/modules/plans/plan.routes.ts
git commit -m "feat(api): close draft after confirm and purge other versions"
```

---

### Task 3: 前端 API 与路由（创建后进入草稿页）

**Files:**
- Modify: `apps/web-user/src/lib/api-client.ts`
- Modify: `apps/web-user/src/router/index.ts`
- Modify: `apps/web-user/src/features/plans/PlanCreatePage.vue`
- Test: `apps/web-user/tests/plan-create-page.test.ts`

- [ ] **Step 1: 在 api-client 增加草稿读取接口**

```ts
getPlanDraft(input: { id: string; token: string }) {
  return request<PlanRecord>(`/plans/${input.id}/draft`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${input.token}` },
  });
}
```

- [ ] **Step 2: 路由新增草稿页入口**

```ts
{
  path: '/plans/:id/draft',
  name: 'plan-draft',
  component: PlanDraftPage,
  meta: { requiresAuth: true },
}
```

- [ ] **Step 3: 创建页提交成功后跳转草稿页**

```ts
const created = await getApiClient().createPlan(payload);
await router.push(`/plans/${created.id}/draft`);
```

- [ ] **Step 4: 更新测试断言跳转目标**

```ts
expect(pushMock).toHaveBeenCalledWith(`/plans/${createdPlan.id}/draft`);
```

- [ ] **Step 5: 运行前端测试确认通过**

Run: `corepack pnpm test -- plan-create-page.test.ts`  
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add apps/web-user/src/lib/api-client.ts apps/web-user/src/router/index.ts apps/web-user/src/features/plans/PlanCreatePage.vue apps/web-user/tests/plan-create-page.test.ts
git commit -m "feat(web): route new plans to draft page"
```

---

### Task 4: 实现草稿页 UI（方案 A）与确认弹窗

**Files:**
- Create: `apps/web-user/src/features/plans/PlanDraftPage.vue`
- Modify: `apps/web-user/src/features/plans/PlanDetailPage.vue`
- Create: `apps/web-user/tests/plan-draft-page.test.ts`
- Test: `apps/web-user/tests/plan-draft-page.test.ts`

- [ ] **Step 1: 写草稿页失败测试（并排卡片、选择、确认弹窗）**

```ts
it('渲染多版本并排卡片并支持选中版本', async () => {
  render(PlanDraftPage, { /* router + mocked client */ });
  expect(screen.getByText('v1')).toBeInTheDocument();
  expect(screen.getByText('v2')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /v2/ }));
  expect(screen.getByRole('button', { name: /确认 v2 并保存/ })).toBeEnabled();
});
```

- [ ] **Step 2: 实现并排卡片 + 卡片内滚动 + 小屏单列切换器**

```vue
<section class="draft-card-grid" data-testid="draft-grid">
  <article
    v-for="version in versions"
    :key="version.version"
    class="draft-card"
    :class="{ 'is-selected': selectedVersion === version.version }"
    @click="selectedVersion = version.version"
  >
    <header>v{{ version.version }}</header>
    <div class="task-scroll">
      <div v-for="stage in version.stages" :key="`${version.version}-${stage.sortOrder}`">
        <p>{{ stage.name }}</p>
        <li v-for="task in stage.tasks" :key="task.id">{{ task.title }}</li>
      </div>
    </div>
  </article>
</section>
```

- [ ] **Step 3: 实现二次确认弹窗与确认后跳转正式详情**

```ts
const showConfirmModal = ref(false);

async function handleConfirm() {
  await getApiClient().confirmPlan({ id: planId.value, token: authState.token, version: selectedVersion.value });
  showConfirmModal.value = false;
  await router.push(`/plans/${planId.value}`);
}
```

- [ ] **Step 4: active 状态访问草稿页自动跳转**

```ts
try {
  await getApiClient().getPlanDraft({ id: planId.value, token: authState.token });
} catch (error) {
  if (error instanceof Error && error.message.includes('409')) {
    await router.replace(`/plans/${planId.value}`);
    return;
  }
  throw error;
}
```

- [ ] **Step 5: 正式详情页去除草稿对比职责（保持执行视图）**

```ts
// PlanDetailPage.vue 仅加载正式计划信息与任务执行入口，不再承载草稿对比 UI
```

- [ ] **Step 6: 运行前端测试**

Run:  
- `corepack pnpm test -- plan-draft-page.test.ts`  
- `corepack pnpm test -- submission-flow.test.ts`  
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add apps/web-user/src/features/plans/PlanDraftPage.vue apps/web-user/src/features/plans/PlanDetailPage.vue apps/web-user/tests/plan-draft-page.test.ts
git commit -m "feat(web): implement draft compare page with confirm modal"
```

---

### Task 5: 全量验证与文档对齐

**Files:**
- Modify: `docs/superpowers/specs/2026-04-09-plan-draft-page-design.md`（若实现差异需回填）
- Test: `apps/api/tests/plan-generation.test.ts`
- Test: `apps/web-user/tests/plan-create-page.test.ts`
- Test: `apps/web-user/tests/plan-draft-page.test.ts`

- [ ] **Step 1: 跑后端类型检查与测试**

Run:
- `corepack pnpm run typecheck --filter @ai-plan/api`
- `corepack pnpm test --filter @ai-plan/api -- plan-generation.test.ts`

Expected: 全部 PASS。

- [ ] **Step 2: 跑前端类型检查与测试**

Run:
- `corepack pnpm run typecheck --filter @ai-plan/web-user`
- `corepack pnpm test --filter @ai-plan/web-user -- plan-create-page.test.ts plan-draft-page.test.ts submission-flow.test.ts`

Expected: 全部 PASS。

- [ ] **Step 3: 手工验收**

Run: `corepack pnpm dev:up`  
Checklist:
- 创建计划后进入 `/plans/:id/draft`
- 多卡并排对比，卡片内任务可滚动
- 点击确认弹二次确认，确认后跳转 `/plans/:id`
- 再访问 `/plans/:id/draft` 被重定向或拒绝

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-04-09-plan-draft-page-design.md
git commit -m "docs: align draft-page spec with implemented behavior"
```

