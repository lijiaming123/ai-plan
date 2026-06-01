# 其它（general）计划：Checkbox-only 打卡 + 仅文字备注 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将“其它场景”（落库 `Plan.type=general`）的打卡改为 checkbox_only：允许空内容勾选完成/撤销完成 + 可选文字备注；禁止附件；不触发 AI 核验/申诉语义，并保持学习/旅游不回归。

**Architecture:** 复用既有 `/plans/:id/schedule/slots/:slotKey/checkins` 与 DELETE 撤销接口，在 API 按 `Plan.type` 分流：general 走无核验分支并校验 attachments 为空；同时前端按 type=general 切换为“完成/撤销 + 备注”UI。补充 API+Web 单测并跑全量回归。

**Tech Stack:** Fastify + Prisma + PostgreSQL；Vue3 + TypeScript；Vitest。

---

## File Map

**API**
- Modify: `apps/api/src/modules/plans/schedule-slot-checkin.service.ts`
- Modify: `apps/api/src/modules/plans/plan.routes.ts`（如需调整 DELETE 允许范围）
- Add tests: `apps/api/tests/general-checkbox-only.test.ts`

**Web-user**
- Modify: `apps/web-user/src/features/plans/PlanDetailPage.vue`
- Modify: `apps/web-user/src/lib/api-client.ts`（如需新增“备注提交”复用现有 post）
- Modify tests: `apps/web-user/tests/plan-detail-page.test.ts`（新增 general 分支用例）

**Prompt**
- Modify: `apps/api/src/modules/plans/plan.routes.ts`、`apps/api/src/modules/plans/plan.service.ts`（general/other prompt 分支）

---

### Task 1: API（general）checkin 分流：允许空 content、禁止 attachments、跳过核验

**Files:**
- Modify: `apps/api/src/modules/plans/schedule-slot-checkin.service.ts`
- Test: `apps/api/tests/general-checkbox-only.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// apps/api/tests/general-checkbox-only.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("general checkbox-only checkin", () => {
  const app = buildApp();
  beforeAll(async () => void (await app.ready()));
  afterAll(async () => void (await app.close()));

  it("general: empty POST should create completion; attachments should be rejected", async () => {
    // login
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "demo@ai-plan.dev", password: "Pass1234!" },
    });
    const { token } = JSON.parse(login.body) as { token: string };

    // create general plan with one slot
    const slotKey = "2026-06-01";
    const requirement = [
      "正文",
      "```json",
      JSON.stringify({ schedule: { granularity: "day", slots: [{ slotKey, content: "做一件小事" }] } }),
      "```",
    ].join("\\n");
    const created = await app.inject({
      method: "POST",
      url: "/plans",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        goal: "其它checkbox测",
        deadline: "2026-06-02T00:00:00.000Z",
        requirement,
        type: "general",
        profile: {
          planMode: "basic",
          basicInfo: {
            planScenario: "other",
            planName: "其它checkbox测",
            planContent: "x",
            currentLevel: "none",
            startDate: slotKey,
            cycle: "custom",
            endDate: "2026-06-02",
            preference: "",
            timeInvestment: "none",
            outputMode: "daily",
            granularityMode: "deep",
          },
        },
      },
    });
    const { id: planId } = JSON.parse(created.body) as { id: string };
    await app.inject({
      method: "POST",
      url: `/plans/${planId}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: { version: 1 },
    });

    // empty POST -> 201
    const emptyPost = await app.inject({
      method: "POST",
      url: `/plans/${planId}/schedule/slots/${slotKey}/checkins`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(emptyPost.statusCode).toBe(201);

    // attachments -> 400
    const bad = await app.inject({
      method: "POST",
      url: `/plans/${planId}/schedule/slots/${slotKey}/checkins`,
      headers: { authorization: `Bearer ${token}` },
      payload: { attachments: [{ url: "https://example.com/a.png" }] },
    });
    expect(bad.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
cd "d:\myproject\ai-plan\apps\api"
corepack pnpm exec vitest run tests/general-checkbox-only.test.ts --reporter=dot
```

- [ ] **Step 3: 最小实现**

在 `createScheduleSlotCheckin` 中：
- 识别 `plan.type === "general"` 时：允许 `!content && attachments==[]`
- 若 `attachments.length>0`：返回 400
- 走与 travel 类似的“直接落库并 return”路径（不触发 evaluate/422）

- [ ] **Step 4: 跑测试通过**

同 Step 2，Expected: PASS

---

### Task 2: API：撤销接口允许范围收敛（general + travel）

**Files:**
- Modify: `apps/api/src/modules/plans/schedule-slot-checkin.service.ts`
- Test: `apps/api/tests/general-checkbox-only.test.ts`（补测）

- [ ] **Step 1: 补测**
- general DELETE 应 200
- study DELETE 应 403（沿用你们已有 study 用例或新加一条最小用例）

- [ ] **Step 2: 实现**

`closeLatestScheduleSlotCheckin` 中将允许撤销的类型改为：
- `travel` 或 `general` → 允许
- 其它 → 403

---

### Task 3: Web-user：general 详情页 UI = 完成/撤销 + 文字备注

**Files:**
- Modify: `apps/web-user/src/features/plans/PlanDetailPage.vue`
- Modify tests: `apps/web-user/tests/plan-detail-page.test.ts`

- [ ] **Step 1: 写失败测试**

新增用例：当 plan.type=general 时，页面不应出现“提交证明”按钮，而应出现“勾选完成/撤销完成”和“添加备注”（或等价 data-testid）。

- [ ] **Step 2: 实现 UI 分支**

复用现有 travel toggle 逻辑：general 使用同样 POST 空 body / DELETE 撤销；备注弹层仅 textarea（提交时 POST `{content}`）。

- [ ] **Step 3: 跑 web-user 单测**

```powershell
cd "d:\myproject\ai-plan\apps\web-user"
corepack pnpm exec vitest run tests/plan-detail-page.test.ts --reporter=dot
```

---

### Task 4: Prompt：general/other 轻量化模板

**Files:**
- Modify: `apps/api/src/modules/plans/plan.routes.ts`
- Modify: `apps/api/src/modules/plans/plan.service.ts`

- [ ] **Step 1: 增加 general/other system prompt**

要求：最小行动 + 可选加分项；避免核验/证据措辞；仍输出严格 schedule JSON。

- [ ] **Step 2: 增加稳定测试（mock deepseek）**

仿照 travel prompt test 的方式，断言走到了 “轻量行动” prompt 分支。

---

### Task 5: 全量回归

- [ ] **Step 1: API 全量**

```powershell
cd "d:\myproject\ai-plan\apps\api"
corepack pnpm exec vitest run --reporter=dot
```

- [ ] **Step 2: Web-user 全量**

```powershell
cd "d:\myproject\ai-plan\apps\web-user"
corepack pnpm exec vitest run --reporter=dot
```

