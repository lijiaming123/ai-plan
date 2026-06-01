# 旅游计划：创建表单 P1 + 勾选打卡/撤销 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `type=travel` 的计划创建页使用旅游专用字段（P1），并在详情页提供“勾选完成/撤销 + 可选旅行记录（附件）”，后端对旅游打卡不做 AI 核验、不触发申诉。

**Architecture:** 复用现有 `/plans` 与 `/plans/:id/schedule/slots/:slotKey/checkins`，在后端按 `Plan.type` 分流；新增 `DELETE .../checkins` 撤销接口并在 DB 为 submission 增加 `closedAt` 以软关闭。前端按 plan.type 切换按钮与抽屉文案，并在创建页为旅游场景启用 P1 字段组，仍映射到现有 `profile.basicInfo` 以保持服务端校验兼容。

**Tech Stack:** Fastify + Prisma + PostgreSQL；Vue3 + TypeScript；Vitest。

---

## File Map（将会改动/新增）

**API**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_plan_schedule_slot_submission_closed_at/migration.sql`
- Modify: `apps/api/src/modules/plans/schedule-slot-checkin.service.ts`
- Modify: `apps/api/src/modules/plans/plan.routes.ts`
- Modify: `apps/api/src/modules/plans/plan.service.ts`（完成态统计逻辑）
- Add/Modify tests:
  - Modify: `apps/api/tests/schedule-slot-checkin.test.ts`
  - Add: `apps/api/tests/travel-checkin-toggle.test.ts`

**Web-user**
- Modify: `apps/web-user/src/lib/api-client.ts`（新增 delete checkin 方法）
- Modify: `apps/web-user/src/features/plans/PlanDetailPage.vue`（旅游：勾选/撤销 + 记录抽屉）
- Modify: `apps/web-user/src/features/plans/PlanCreatePage.vue`（旅游：P1 字段、占位文案、拼装 requirement）

**Prompt**
- Modify: `apps/api/src/modules/plans/*`（旅游专用 prompt/模板，按现有生成实现落点确定）

---

### Task 1: DB 迁移：submission 支持软撤销（closedAt）

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/.../migration.sql`
- Test: `apps/api/tests/travel-checkin-toggle.test.ts`

- [ ] **Step 1: 写失败测试（撤销后不算完成）**

在新测试文件中先写用例骨架（此时会因接口/字段未实现而失败）：

```ts
// apps/api/tests/travel-checkin-toggle.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("travel checkin toggle", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("travel: POST 空 body 也应创建 submission；DELETE 后计划详情不再视为完成", async () => {
    // TODO: login, create travel plan with one slot, confirm
    // POST checkin with empty payload -> 201
    // GET plan -> slot submissions length === 1
    // DELETE checkin -> 200
    // GET plan -> slot submissions length === 0 (or undefined)
    expect(true).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
cd "d:\myproject\ai-plan\apps\api"
corepack pnpm exec vitest run tests/travel-checkin-toggle.test.ts --reporter=dot
```

Expected: FAIL（占位断言 / 接口未实现）。

- [ ] **Step 3: 最小实现：Prisma schema 增加 closedAt**

```prisma
// apps/api/prisma/schema.prisma
model PlanScheduleSlotSubmission {
  // ...
  closedAt DateTime?
  // ...
  @@index([planId, slotKey])
  @@index([userId])
  @@index([planId, userId, slotKey, closedAt])
  @@unique([planId, userId, slotKey, idempotencyKeyHash])
}
```

- [ ] **Step 4: 生成并应用迁移（非交互方式）**

Run（示例，按仓库现有实践生成 SQL migration 文件）：

```powershell
cd "d:\myproject\ai-plan\apps\api"
corepack pnpm prisma migrate diff --from-url "$env:DATABASE_URL" --to-schema-datamodel "prisma/schema.prisma" --script
```

把输出写入 `prisma/migrations/.../migration.sql`，内容类似：

```sql
ALTER TABLE "PlanScheduleSlotSubmission" ADD COLUMN "closedAt" TIMESTAMP(3);
CREATE INDEX "PlanScheduleSlotSubmission_planId_userId_slotKey_closedAt_idx"
ON "PlanScheduleSlotSubmission"("planId","userId","slotKey","closedAt");
```

然后执行：

```powershell
corepack pnpm prisma migrate deploy
corepack pnpm prisma generate
```

---

### Task 2: API：旅游打卡分流（不核验）+ 撤销接口（DELETE）

**Files:**
- Modify: `apps/api/src/modules/plans/schedule-slot-checkin.service.ts`
- Modify: `apps/api/src/modules/plans/plan.routes.ts`
- Modify: `apps/api/src/modules/plans/plan.service.ts`
- Test: `apps/api/tests/travel-checkin-toggle.test.ts`

- [ ] **Step 1: 写失败测试（POST 空 body 不应 400；DELETE 存在）**

在 Task 1 的测试中补齐真实流程（login → create travel plan → confirm → post empty → delete → get plan），期望：
- POST statusCode 201
- DELETE statusCode 200
- 第二次 GET 计划 `scheduleSlotSubmissions[slotKey]` 为空

- [ ] **Step 2: 运行测试确认失败**

同 Task 1 Step 2，Expected: FAIL（当前空 body 可能 400，且无 DELETE 路由）。

- [ ] **Step 3: 后端实现：createScheduleSlotCheckin 增加 travel 分支**

在 `createScheduleSlotCheckin` 读取 plan 后（已有），加入：

```ts
// apps/api/src/modules/plans/schedule-slot-checkin.service.ts（示意片段）
if (plan.type === "travel") {
  // 允许空内容/空附件
  const created = await prisma.planScheduleSlotSubmission.create({
    data: {
      planId: params.planId,
      slotKey: params.slotKey,
      userId: params.userId,
      content,
      status: "submitted",
      ...(idempotencyKeyHash ? ({ idempotencyKeyHash } as never) : {}),
      ...(normalizedUrls.length
        ? {
            attachments: {
              createMany: {
                data: normalizedUrls.map((a) => ({
                  url: a.url,
                  fileName: a.fileName ?? null,
                  kind: normalizeKind(a.kind, a.fileName, a.url),
                  hash: hashUrl(a.url),
                })),
              },
            },
          }
        : {}),
    },
    include: { attachments: true },
  });
  await markUploadedFilesReferenced({
    userId: params.userId,
    urls: normalizedUrls.map((a) => a.url),
    referencedBy: created.id,
  });
  return { ok: true, submission: serializeSubmission(created as any) };
}
```

同时确保 travel 分支不会触发：
- `extractTextFromAttachmentUrl`
- `evaluateCheckinSubmission`
- `planScheduleSlotAppeal.updateMany`（关闭 open 申诉）可保留但旅游不会进入申诉流程

- [ ] **Step 4: 新增撤销服务函数**

在同文件新增：

```ts
export async function closeLatestScheduleSlotCheckin(params: {
  planId: string;
  userId: string;
  slotKey: string;
}): Promise<{ ok: true } | { ok: false; code: 404; message: string }> {
  const plan = await prisma.plan.findFirst({ where: { id: params.planId, userId: params.userId } });
  if (!plan) return { ok: false, code: 404, message: "plan not found" };

  const latest = await prisma.planScheduleSlotSubmission.findFirst({
    where: { planId: params.planId, userId: params.userId, slotKey: params.slotKey, closedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!latest) return { ok: false, code: 404, message: "no open submission" };

  await prisma.planScheduleSlotSubmission.update({
    where: { id: latest.id },
    data: { closedAt: new Date() },
  });
  return { ok: true };
}
```

- [ ] **Step 5: 路由层新增 DELETE /checkins**

```ts
// apps/api/src/modules/plans/plan.routes.ts（示意片段）
fastify.delete(
  "/plans/:id/schedule/slots/:slotKey/checkins",
  { preHandler: fastify.requireRole("user") },
  async (request, reply) => {
    const payload = await request.jwtVerify<{ sub: string }>();
    const id = String((request.params as any).id ?? "");
    const slotKey = String((request.params as any).slotKey ?? "");
    const res = await closeLatestScheduleSlotCheckin({
      planId: id,
      userId: payload.sub,
      slotKey,
    });
    if (!res.ok) return reply.code(res.code).send({ message: res.message });
    return reply.send({ ok: true });
  },
);
```

- [ ] **Step 6: 修正“完成态=存在提交”假设**

在 `apps/api/src/modules/plans/plan.service.ts` 搜索注释：
> 只有核验通过才会创建 ... 因此“存在任意提交行”等价于“曾经通过”

将所有用于统计/热力图/详情聚合的查询改为过滤 `closedAt is null`（或 SQL where `"closedAt" IS NULL`）。

- [ ] **Step 7: 运行测试通过**

Run:

```powershell
cd "d:\myproject\ai-plan\apps\api"
corepack pnpm exec vitest run tests/travel-checkin-toggle.test.ts --reporter=dot
```

Expected: PASS

---

### Task 3: Web-user：详情页旅游交互（勾选/撤销 + 旅行记录抽屉）

**Files:**
- Modify: `apps/web-user/src/lib/api-client.ts`
- Modify: `apps/web-user/src/features/plans/PlanDetailPage.vue`
- Test: `apps/web-user` 相关（若已有 vitest；否则做最小 E2E 手测步骤）

- [ ] **Step 1: API client 增加 delete checkin 方法（先写使用处类型报错）**

```ts
// apps/web-user/src/lib/api-client.ts
deletePlanScheduleSlotCheckin(input: { id: string; slotKey: string; token: string }): Promise<{ ok: true }>;
```

实现：

```ts
return request<{ ok: true }>(`/plans/${input.id}/schedule/slots/${encodeURIComponent(input.slotKey)}/checkins`, {
  method: "DELETE",
  headers: { Authorization: `Bearer ${input.token}` },
});
```

- [ ] **Step 2: 详情页分支 UI**

在 `PlanDetailPage.vue`：
- 当 `plan.value?.type === "travel"`：
  - 主按钮显示“打卡/已完成”（toggle）
  - 点击未完成 → 调 `postPlanScheduleSlotCheckin`，body 为空（不传 content/attachments）
  - 点击已完成 → 调 `deletePlanScheduleSlotCheckin`
  - “提交证明”按钮改为“添加记录”，打开抽屉；抽屉标题/提示改为“旅行记录”
  - 隐藏 review/申诉相关 UI 区块（不渲染）

- [ ] **Step 3: 手测步骤**

Run dev 后手测：
- 创建旅游计划 → 详情页对某天点击打卡 → 状态变已完成
- 再次点击 → 状态变未完成
- 点击添加记录 → 上传图片并提交 → 仍显示已完成

---

### Task 4: Web-user：创建页旅游场景 P1 字段 + requirement 拼装 + 占位文案

**Files:**
- Modify: `apps/web-user/src/features/plans/PlanCreatePage.vue`

- [ ] **Step 1: 增加旅游 P1 字段模型（from/to/companions/styles/budget/transport/constraints）**

确保这些字段在提交时拼装成 requirement 文本块，并且：
- 仍填充 `profile.basicInfo` required 字段（隐藏但默认值补齐）
- `deadline` 使用 `endDate` 生成

- [ ] **Step 2: 占位文案替换**

旅游场景下将 goal/requirement 等文案替换为旅游语义（见 spec 5.1/5.3）。

- [ ] **Step 3: 手测**

创建旅游计划，检查后端落库：
- type=travel
- deadline/endDate 映射正确
- requirement 里包含旅行模板块

---

### Task 5: Prompt：旅游类型生成模板（行程化输出）

**Files:**
- Modify: `apps/api/src/modules/plans/*`（根据现有生成实现落点）

- [ ] **Step 1: 定位当前生成 prompt 落点**

搜索并确认旅游类型生成在哪个 system prompt 组装处决定内容语气。

- [ ] **Step 2: 为 travel 增加旅游专用段落**

确保每个 slot.content 建议包含：
- 路线顺序（早/午/晚）
- 交通方式与时长
- 预约/门票提醒
- 备选方案
- 可选记录建议

- [ ] **Step 3: 手测生成效果**

用旅游创建页输入一组字段，生成草稿后查看 schedule 内容是否“行程化”。

---

### Task 6: 全量验证

- [ ] **Step 1: API 全量测试**

```powershell
cd "d:\myproject\ai-plan\apps\api"
corepack pnpm exec vitest run --reporter=dot
```

- [ ] **Step 2: Web-user 单测（若存在）**

```powershell
cd "d:\myproject\ai-plan\apps\web-user"
corepack pnpm test
```

- [ ] **Step 3: 关键手测清单**
- 旅游：打卡/撤销/添加记录
- 学习：仍需证明、仍可能 422、仍可申诉
- 上传：UploadedFile 仍会被引用标记，不会被 GC 误删

