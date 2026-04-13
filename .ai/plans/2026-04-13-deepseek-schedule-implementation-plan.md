# DeepSeek 计划正文 + 打卡表（按颗粒度）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DeepSeek 在创建计划时输出“正文 + 可打卡 schedule（按天/按周）”，并移除创建页的 outputMode，改由 granularityMode（必填）决定打卡粒度；smart 自动推荐在 ≤3 个月默认按天。

**Architecture:** 系统负责生成稳定的 slotKeys 骨架（day/week），DeepSeek 只填每个 slot 的一段内容；服务端解析 JSON code block、严格校验 slotKey 一一对应，失败则降级为系统默认文案，保证流程不阻塞。

**Tech Stack:** Fastify + Prisma（apps/api），Vue3 + Vite + Vitest（apps/web-user），DeepSeek Chat Completions 兼容接口（apps/api/src/lib/deepseek.ts）。

## 实施状态（2026-04-13）

- [x] Task 1：颗粒度决策 + slotKeys 生成（含 smart<=92天）+ 测试
- [x] Task 2：DeepSeek 输出协议（正文 + JSON schedule）+ 解析/校验/降级 + 测试
- [x] Task 3：schedule 落库到 PlanVersion（新增列）+ 读写（含 slot.content 可编辑与恢复）+ 测试
- [x] Task 4：前端创建页移除 outputMode，granularityMode 必填 + 测试
- [x] Task 4.5：详情页展示 schedule + 编辑 slot.content / 恢复生成内容 + 测试

---

## File structure / 影响范围

**Backend（apps/api）**
- Modify: `apps/api/src/modules/plans/plan.routes.ts`
  - 创建计划 body 校验：移除 outputMode；强制 granularityMode 必填
  - 构造 DeepSeek prompt：提供 slotKeys 列表并要求 JSON code block
  - 解析/校验/降级：抽成可测的纯函数
- Modify: `apps/api/src/modules/plans/plan.service.ts`
  - 生成 slotKeys（day/week）与 smart 自动规则
  - 将 schedule 写入版本快照（或新增字段/表，视当前 Prisma schema 而定）
- Modify/Add (可能需要): `apps/api/prisma/schema.prisma`（若决定新增列/表存 schedule）
- Add tests: `apps/api/tests/plans/plan-schedule.test.ts`（或按现有测试布局）

**Frontend（apps/web-user）**
- Modify: `apps/web-user/src/features/plans/PlanCreatePage.vue`
  - 移除“输出形式”UI 与提交字段
  - granularityMode 必填：deep/rough/smart（并提示 smart 推荐逻辑）
- Modify: `apps/web-user/tests/plan-create-page.test.ts`
  - 更新断言：不再提交 outputMode；granularityMode 必填且与 day/week 规则一致

**Docs / Memory**
- Modify: `docs/superpowers/specs/2026-04-13-deepseek-plan-content-and-checkin-schedule.md`（如实现中发现 schema/边界需补充）
- Modify: `.ai/logs/operation-log.md`

---

## Task 1: 计划颗粒度规则落地（slot 骨架生成）

**Files:**
- Modify: `apps/api/src/modules/plans/plan.service.ts`
- Test: `apps/api/tests/plans/plan-schedule.test.ts`（若不存在则创建目录与文件）

- [ ] **Step 1: 写失败测试：smart ≤92 天 → day，否则 week**

示例测试（按项目测试框架调整）：

```ts
import { describe, expect, it } from 'vitest';
import { decideScheduleGranularity } from '../../src/modules/plans/plan.service';

describe('schedule granularity decision', () => {
  it('smart: <= 92 days => day', () => {
    expect(decideScheduleGranularity({ mode: 'smart', startDate: '2026-04-01', endDate: '2026-06-30' })).toBe('day');
  });
  it('smart: > 92 days => week', () => {
    expect(decideScheduleGranularity({ mode: 'smart', startDate: '2026-01-01', endDate: '2026-06-30' })).toBe('week');
  });
  it('deep => day; rough => week', () => {
    expect(decideScheduleGranularity({ mode: 'deep', startDate: '2026-04-01', endDate: '2026-04-30' })).toBe('day');
    expect(decideScheduleGranularity({ mode: 'rough', startDate: '2026-04-01', endDate: '2026-04-30' })).toBe('week');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run（示例）：
- `corepack pnpm --filter @ai-plan/api test`

Expected:
- FAIL，提示 `decideScheduleGranularity` 不存在或行为不符合断言

- [ ] **Step 3: 实现 decideScheduleGranularity + buildSlotKeys**

在 `plan.service.ts` 增加纯函数（可被 routes/service 调用）：

```ts
export type ScheduleGranularity = 'day' | 'week';

export function decideScheduleGranularity(params: { mode: 'deep' | 'rough' | 'smart'; startDate: string; endDate: string }): ScheduleGranularity {
  if (params.mode === 'deep') return 'day';
  if (params.mode === 'rough') return 'week';
  const start = new Date(`${params.startDate}T00:00:00`);
  const end = new Date(`${params.endDate}T00:00:00`);
  const ms = end.getTime() - start.getTime();
  const days = Math.max(1, Math.floor(ms / 86400000) + 1);
  return days <= 92 ? 'day' : 'week';
}

export function buildSlotKeys(params: { granularity: ScheduleGranularity; startDate: string; endDate: string }): string[] {
  if (params.granularity === 'week') {
    const start = new Date(`${params.startDate}T00:00:00`);
    const end = new Date(`${params.endDate}T00:00:00`);
    const ms = end.getTime() - start.getTime();
    const days = Math.max(1, Math.floor(ms / 86400000) + 1);
    const weeks = Math.max(1, Math.ceil(days / 7));
    return Array.from({ length: weeks }, (_, i) => `W${i + 1}`);
  }
  // day
  const out: string[] = [];
  const start = new Date(`${params.startDate}T00:00:00`);
  const end = new Date(`${params.endDate}T00:00:00`);
  for (let d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run：
- `corepack pnpm --filter @ai-plan/api test`

Expected:
- PASS

---

## Task 2: DeepSeek 输出协议（正文 + JSON schedule）与解析降级

**Files:**
- Modify: `apps/api/src/modules/plans/plan.routes.ts`
- Add/Modify: `apps/api/src/modules/plans/deepseek-schedule.ts`（建议新增：集中 prompt/parse/validate 纯函数）
- Test: `apps/api/tests/plans/deepseek-schedule.test.ts`

- [ ] **Step 1: 写失败测试：从文本提取最后一个 ```json code block 并解析**

```ts
import { describe, expect, it } from 'vitest';
import { extractJsonCodeBlock, parseScheduleOrNull } from '../../src/modules/plans/deepseek-schedule';

it('extracts last json fenced block', () => {
  const raw = `正文...\\n\\n\\\n\`\`\`json\\n{\"a\":1}\\n\`\`\`\\n\\n\`\`\`json\\n{\"schedule\":{\"granularity\":\"day\",\"slots\":[{\"slotKey\":\"2026-04-13\",\"content\":\"做一件可验证的事\"}]}}\\n\`\`\``;
  expect(extractJsonCodeBlock(raw)).toContain('\"schedule\"');
});

it('returns null when invalid json', () => {
  expect(parseScheduleOrNull('not json')).toBeNull();
});
```

- [ ] **Step 2: 实现 extract/parse/validate（严格 slotKey 对齐）**

核心接口（示意）：

```ts
export type ParsedSchedule = { granularity: 'day' | 'week'; slots: Array<{ slotKey: string; content: string; title?: string }> };

export function extractJsonCodeBlock(text: string): string | null { /* 找最后一个 ```json ... ``` */ }

export function parseScheduleOrNull(jsonText: string): ParsedSchedule | null { /* JSON.parse + 形状检查 */ }

export function validateScheduleStrict(params: { expectedGranularity: 'day' | 'week'; expectedSlotKeys: string[]; schedule: ParsedSchedule }): { ok: true; schedule: ParsedSchedule } | { ok: false; reason: string } {
  // 1) granularity 一致
  // 2) slots 数量一致
  // 3) slots[i].slotKey === expectedSlotKeys[i]
  // 4) content 非空
}

export function buildFallbackSchedule(params: { granularity: 'day' | 'week'; slotKeys: string[] }): ParsedSchedule {
  const content = params.granularity === 'day'
    ? '今日重点：围绕目标推进 1 个可验证动作。完成后记录证据。'
    : '本周目标：完成 1 个里程碑 + 复盘 1 次。';
  return { granularity: params.granularity, slots: params.slotKeys.map((slotKey) => ({ slotKey, content })) };
}
```

- [ ] **Step 3: 在 plan.routes.ts 构造 prompt（提供 slotKeys）**

新增 system/user 协议要点：
- 输出中文正文
- 最后必须输出 ```json code block
- JSON 仅包含 schedule（granularity + slots，slotKey 必须来自系统提供列表，顺序一致）

并在调用 DeepSeek 前生成：
- `granularity`（day/week）
- `slotKeys[]`（逐行拼接进 prompt）

- [ ] **Step 4: 路由层集成解析与降级**

集成点：
- DeepSeek 返回 `content`
- 提取 JSON → parse → validate
- 失败：fallback schedule
- 成功：使用 schedule

产出：
- 在创建计划返回体/落库中带上 schedule（具体落库见 Task 3）

---

## Task 3: 落库方案（PlanVersionSnapshot 扩展或新表）

**Files:**
- Inspect/Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/src/modules/plans/plan.service.ts`
- Test: `apps/api/tests/plans/plan-persist-schedule.test.ts`

- [ ] **Step 1: 决定存储位置**

推荐优先级：
1. **PlanVersion 增加 `schedule` JSON 字段**（与 snapshot 同版本绑定，最符合“版本回放”）
2. 或 Plan 增加 `schedule`（简单但不随版本变化）
3. 或新表 PlanSchedule（更复杂，除非要做大量查询/审核聚合）

- [ ] **Step 2: 写迁移与 Prisma client 更新（如需要）**

Run（示例）：
- `corepack pnpm --filter @ai-plan/api prisma migrate dev`

- [ ] **Step 3: 写失败测试：创建计划后能读到 schedule**

测试思路：
- mock DeepSeek 返回正文 + JSON
- 调用 create 逻辑
- getPlan / getDraft 返回的结构里能取到 schedule（或从 planVersion 读到）

---

## Task 4: 前端创建页移除 outputMode，granularityMode 必填

**Files:**
- Modify: `apps/web-user/src/features/plans/PlanCreatePage.vue`
- Modify: `apps/web-user/tests/plan-create-page.test.ts`

- [ ] **Step 1: 删除 UI 与状态字段**

移除：
- 输出形式下拉（daily/phase-weekly/phase-monthly）
- 提交 payload 中的 outputMode

保留/强化：
- granularityMode（deep/rough/smart）必填
- 提示文案：smart ≤3个月推荐按天

- [ ] **Step 2: 更新测试断言**

关键断言变化：
- createPlan 请求体不再包含 outputMode
- 必须包含 granularityMode

- [ ] **Step 3: 跑 web-user 全量测试**

Run：
- `corepack pnpm --filter @ai-plan/web-user test`

Expected：
- PASS

---

## Task 4.5: 打卡表 slot 内容可编辑（新增）

**Files:**
- Backend Modify: `apps/api/src/modules/plans/plan.routes.ts`
- Backend Modify: `apps/api/src/modules/plans/plan.service.ts`
- Backend Test: `apps/api/tests/plans/plan-schedule-edit.test.ts`
- Frontend Modify: `apps/web-user/src/features/plans/PlanDetailPage.vue`（或后续新增 schedule 视图组件）
- Frontend Test: `apps/web-user/tests/plan-detail-page.test.ts`（若不存在则创建相应测试文件）

- [ ] **Step 1: 后端：设计更新接口（PATCH 单个 slot）**

建议 API（示意）：
- `PATCH /plans/:id/schedule/slots/:slotKey`
  - body: `{ content: string }`
  - 行为：定位“当前执行版本”的 schedule slot（或指定 version），更新 `content`，并设置 `contentSource='edited'`、`editedAt`、`editedByUserId`

- [ ] **Step 2: 写失败测试：编辑后可读到更新的 content**

测试思路：
- 先创建 plan + schedule（mock DeepSeek）
- 调用 PATCH 更新某 slot
- getPlan 再读：对应 slot.content 变化且 source=edited

- [ ] **Step 3: 后端：实现更新与校验**

校验点：
- slotKey 必须存在且属于该版本 schedule
- content 非空且长度限制（与 spec 一致）
- 不允许改 slotKey / 增删 slot

- [ ] **Step 4: 前端：PlanDetail 增加编辑交互（最小可用）**

最小交互：
- 每个 slot 显示 content 与“编辑”按钮
- 编辑弹窗/抽屉 textarea
- 保存调用 API，成功后更新 UI
- “恢复为生成内容”（可选）：把 content 置回 generatedContent，并将 source 改回 generated

- [ ] **Step 5: 前端测试与回归**

Run：
- `corepack pnpm --filter @ai-plan/web-user test`
Expected：PASS

---

## Task 5: 端到端回归（本地）

**Files:**
- None (commands)

- [ ] **Step 1: 启动 dev 环境**

Run（项目现有脚本）：
- `corepack pnpm dev:up`

- [ ] **Step 2: 创建计划（deep/rough/smart）验证**
- deep：详情页应出现按天 schedule（slotKey = 日期）
- rough：详情页应出现按周 schedule（Wn）
- smart：≤3个月按天；>3个月按周
- DeepSeek JSON 缺失/错误时：仍能创建并有 fallback schedule

---

## Notes / 风险
- JSON 协议必须严格；模型可能输出额外文字污染 code block：解析要只取 fenced block。
- slotKeys 过长会膨胀 prompt：必须有上限保护（spec 已写）。
- 若未来要升级到“逐条任务打卡”，可在 schedule slot 增加 checklist 数组，向下兼容现有 content。

