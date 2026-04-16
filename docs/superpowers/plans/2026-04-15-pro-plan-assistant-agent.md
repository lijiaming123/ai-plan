# 专业版「计划助手 Agent（生成→批评→打分→优化→再问）」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为专业版（Pro）提供一个更强、更稳定、可控的“计划助手 Agent”，实现你定义的闭环：**先生成计划 → 自动批评 → 打分并找问题 → 自动优化出更可执行版本 → 再询问用户选择（少量选项） → 基于反馈微调**。在不改变用户“一键生成”体验的前提下，通过 **JSON First + 规则校验 + 小步可重试 + 缓存/降级/观测** 同时提升质量与可用性，并控制调用成本。

**Architecture:** 将 Pro Agent 核心逻辑抽离为独立 package（纯函数、可单测、无 Fastify 依赖），在 `apps/api` 仅做薄封装与鉴权分流。Agent 采用“受控编排器（orchestrator）”：一次请求内部拆为固定阶段，并且 **先自动优化再问用户**（你确认的 A/B：可执行性优先、优化后再问）。底层统一通过现有 `LLM Router` 调用模型；schedule 仍走 `deepseek-schedule.ts` 的 strict 校验与 fallback。

**Tech Stack:** Fastify + TypeScript（apps/api）、Vitest（单测）、现有 `LLM Router`（`apps/api/src/lib/llm/*`）、现有 schedule 校验（`apps/api/src/modules/plans/deepseek-schedule.ts`）。

---

## 0. 约束与决策（先写死，避免后期返工）

- **触达范围**：仅 Pro 用户可使用“Agent增强能力”。非 Pro 继续走现有 `/plans/assistant`（或走同接口但能力降级）。
- **交互策略（A/B）**：
  - **A 可执行性优先**：评分与批评以“可执行/可验收/时间预算/节奏/风险”维度为核心；生成输出必须落到可行动任务。
  - **B 优化后再问**：先自动把计划优化到更可执行版本，再给用户 2–4 个可选项做微调，减少来回沟通成本。
- **澄清轮数**：最多 **1 轮**（对应你“成本 A”的策略）。如果关键信息缺失，则用“最小可用假设”继续生成，并在输出的 `assumptions[]` 明示。
- **输出形态**：**JSON First**（至少包含 schedule；可逐步扩展为 planOutline JSON），再渲染为 `suggestedContent`。
- **可观测性**：记录每阶段耗时、是否走缓存、是否触发降级、是否触发“贵模型兜底”（只对 Pro/失败≥2 触发）。
- **幂等缓存**：同一输入（含用户ID、goal、日期、requirement、granularityMode、message）命中缓存，避免重复烧钱。

---

## 0.1 你定义的 Pro Agent 闭环（产品语义）

一次请求内部执行：

1. **Draft（生成）**：产出“计划正文 + 严格 schedule JSON”。
2. **Critique（批评）**：找出 Top 问题（可执行性 rubric）。
3. **Score（打分）**：输出总分 + 分维度分数 + 解释（可执行性权重最高）。
4. **Auto-Revise（自动优化）**：在不推倒重来的前提下，仅针对 Top 问题修补并输出优化版正文 +（必要时）修补后的 schedule。
5. **Ask（优化后再问）**：给用户 2–4 个选项（更细/更省时/更稳/更激进），并说明利弊。
6. **Apply Choice（可选）**：用户选择后，仅对相关段落/slot 内容进行二次微调（最多 1 次）。

---

## 1. API 设计（兼容现有前端，最小新增）

### 方案 A（推荐，最小改动）：扩展现有 `/plans/assistant`

**请求体**：沿用 `PlanAssistantBody`，新增可选字段：

- `tier?: "free" | "pro"`（后端也可从用户订阅/配置表判断；前端可先不传）
- `agent?: "basic" | "pro"`（默认 basic；Pro 用户可选 pro）

**响应体**：保持现有形状：

- `reply: string`
- `suggestedContent: string`
- `schedule?: { granularity, slots[] }`
- （可选）`meta?: { usedAgent: "basic"|"pro"; cached: boolean; providerId?: string; fallbacks?: string[] }`

> 兼容策略：前端不认识 `meta` 也不会坏；你可以逐步用它做“Pro徽标/解释性信息”。

### 方案 B：新增 `/plans/assistant-pro`

仅在你希望严格隔离、便于灰度时采用。短期不建议（会增加前后端分支与维护成本）。

---

## 2. Agent 编排器（服务端）设计

新增：抽离到 package：`packages/pro-plan-agent/`（核心实现），`apps/api` 仅接入。

### 阶段定义（固定流水线）

1. **Normalize**
   - 修剪字符串、统一换行、限制长度（避免 prompt 注入与异常 token）
2. **Clarify（最多 1 轮）**
   - 当且仅当缺失关键信息（例如 requirement 为空且目标过泛）才触发
   - 产出：`clarifyingQuestion?: string`
   - 前端如暂不支持多轮：可直接将 question 拼入 `reply`，并仍返回一个“可用草案”（带 assumptions）
3. **Skeleton(JSON)**
   - 生成严格 JSON：至少包含 schedule；可扩展包含 milestones / weeklyPlan
4. **Validate（规则 + strict schedule）**
   - schedule：复用 `validateScheduleStrict`
   - 规则：日期跨度/颗粒度/slotKeys 对齐
5. **Patch（仅补缺口）**
   - JSON 不合法时，优先用“便宜模型修补 JSON”，失败才升级兜底
6. **Render**
   - 将 JSON + 用户信息渲染为 `suggestedContent`（可用便宜模型或模板渲染）

7. **Critique + Score（可执行性优先）**
   - 规则优先：硬约束（日期/slotKeys/空内容/时长预算缺失）先判定
   - 模型补充：软约束（表达是否可操作、是否有证据、风险是否具体）
   - 产出：`issues[]`、`scoreBreakdown`、`scoreTotal`

8. **Auto-Revise（先优化后再问）**
   - 仅针对 issues TopN 做“局部修补”，避免整篇重写导致漂移

9. **Options（选择题）**
   - 给 2–4 个选项：每个选项含“你将得到什么 / 代价是什么”

### 失败策略（成本 A + 质量 B）

- 任一阶段失败：
  - 先局部重试 1 次（只重试该阶段）
  - 再降级：跳过模型，走本地模板 + fallback schedule
- “贵模型兜底”触发（仅 Pro）：
  - skeleton/patch 连续失败 ≥ 2

---

## 3. 数据与权限（Pro 开关）

优先最小实现：

- **短期**：在后端通过一个简单函数 `isProUser(userId)` 判定（可先用 env 白名单 / 固定测试用户），后续再接真实订阅表。
- **中期**：新增订阅/权益表（此计划不覆盖）。

---

## 4. 任务拆解（TDD 优先，逐步落地）

### Task 1：抽离 package + 定义 Pro Agent 的纯函数编排器（不接网络）

**Files:**
- Create: `packages/pro-plan-agent/package.json`
- Create: `packages/pro-plan-agent/src/index.ts`
- Create: `packages/pro-plan-agent/src/types.ts`
- Test: `apps/api/tests/pro-plan-agent.test.ts`（先在 api 工程里跑 vitest，避免额外测试配置）

- [ ] **Step 1: 写 failing test（生成→批评→打分→自动优化→选项）**

```ts
import { describe, expect, it } from 'vitest';
import { runProPlanAssistantAgent } from '../src/modules/plans/pro-assistant-agent';

describe('pro assistant agent', () => {
  it('应产出 suggestedContent 与 schedule（或在失败时 fallback schedule）', async () => {
    const res = await runProPlanAssistantAgent({
      userId: 'u1',
      mode: 'draft',
      goal: '备考雅思',
      requirement: '目标 7.0，每周 5 小时',
      startDate: '2026-04-10',
      endDate: '2026-07-10',
      cycle: '3m',
      granularityMode: 'smart',
      llm: {
        complete: async () => {
          return [
            '这里是正文',
            '```json',
            '{\"schedule\":{\"granularity\":\"week\",\"slots\":[{\"slotKey\":\"W1\",\"content\":\"...\"}]}}',
            '```',
          ].join('\\n');
        },
      },
    });
    expect(res.draft.suggestedContent.length).toBeGreaterThan(0);
    expect(res.draft.schedule).toBeDefined();
    expect(res.review.scoreTotal).toBeGreaterThanOrEqual(0);
    expect(res.review.scoreTotal).toBeLessThanOrEqual(100);
    expect(res.review.issues.length).toBeGreaterThan(0);
    expect(res.revised.suggestedContent.length).toBeGreaterThan(0);
    expect(res.options.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 实现最小编排器**
  - 将 LLM 依赖以参数注入（便于单测）
  - 复用现有：`decideScheduleGranularity`、`buildScheduleSlotKeys`、`extractLastJsonCodeBlock`、`parseScheduleWireOrNull`、`validateScheduleStrict`、`buildFallbackSchedule`、`stripLastJsonCodeBlock`

- [ ] **Step 3: 运行测试确保通过**

Run: `Set-Location apps/api; corepack pnpm exec vitest run tests/pro-assistant-agent.test.ts`

---

### Task 2：路由层接入（仅 Pro 用户走 agent）

**Files:**
- Modify: `apps/api/src/modules/plans/plan.routes.ts`（`/plans/assistant` handler）
- Modify: `apps/api/src/modules/plans/plan.routes.ts`（类型：CreatePlanBody.profile.proSettings 可带 `aiDepth`/`reminderMode` 的传递策略）
- Test: `apps/api/tests/plan-generation.test.ts`（新增 Pro 路径断言，保持老路径不回归）

- [ ] **Step 1: 写 failing test（Pro 走 agent，返回带 schedule）**
  - 若暂时没有订阅表：在测试中 mock `isProUser()` 为 true
  - 断言响应包含 `schedule` 且 `reply` 带 Pro 提示（例如“已使用专业版助手生成”）

- [ ] **Step 2: 实现 handler 分流**
  - `if (isProUser && agent==='pro')` → 调用 `runProPlanAssistantAgent`
  - else → 走当前逻辑（已接 router 的 DeepSeek / fallback）

- [ ] **Step 3: 跑 plan-generation tests**

Run: `Set-Location apps/api; corepack pnpm exec vitest run tests/plan-generation.test.ts`

---

### Task 3：观测与成本控制（最小闭环）

**Files:**
- Modify: `apps/api/src/modules/plans/pro-assistant-agent.ts`
- Modify: `.ai/logs/operation-log.md`

- [ ] **Step 1: 在 agent 内输出结构化 metric（阶段耗时、缓存命中、fallback 原因）**
- [ ] **Step 2: 将 metric 通过 request.log 记录（P0 先日志，后续再入库聚合）**
- [ ] **Step 3: 更新 operation log（本地时间戳，严格格式）**

---

## 5. 验收标准（第一版 Pro Agent）

- **稳定性**：第三方不可用时仍 200，且返回可用 `suggestedContent` + fallback schedule（draft 模式）。
- **质量**：输出必含“阶段目标 + 可执行任务 + 验收/证据 + 风险/复盘”四块（可通过规则检测关键标题）。
- **成本**：同输入 60 秒内重复调用命中缓存（从日志可见 `cached: true`）。
- **兼容**：现有前端无需改动即可使用（仍读取 `reply/suggestedContent/schedule`）。

