# Basic Plan Granularity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在普通版创建计划流程中落地“智能推荐/深度计划/粗略计划”颗粒度规则，并让草稿生成、确认后切换、打卡提交都基于统一时间槽模型工作。  

**Architecture:** 后端新增颗粒度决策器并将 AI 草稿标准化为统一 `timeSlot` 结构；前端在普通版创建页新增颗粒度字段与推荐提示，草稿页支持确认后切换颗粒度并二次确认后触发重生成。测试分三层：规则单测、接口集成测试、页面行为测试。  

**Tech Stack:** Vue 3 + TypeScript + Vue Router + Vitest，Fastify + Prisma + Vitest。

---

### Task 1: 颗粒度规则引擎（后端纯逻辑，TDD）

**Files:**
- Create: `apps/api/src/modules/plans/granularity.ts`
- Create: `apps/api/tests/plan-granularity.test.ts`
- Modify: `apps/api/src/modules/plans/plan.routes.ts`

- [ ] **Step 1: 写失败测试（边界值 6/7/29/30 天）**

```ts
import { describe, expect, it } from 'vitest';
import { resolveGranularityPlan } from '../src/modules/plans/granularity';

describe('plan granularity rules', () => {
  it('deep: D=6 -> day only', () => {
    const output = resolveGranularityPlan({ mode: 'deep', durationDays: 6 });
    expect(output.slots).toEqual(['day']);
    expect(output.summaries).toEqual([]);
  });

  it('deep: D=7 -> day + weekly summary', () => {
    const output = resolveGranularityPlan({ mode: 'deep', durationDays: 7 });
    expect(output.slots).toEqual(['day']);
    expect(output.summaries).toEqual(['weekly']);
  });

  it('deep: D=30 -> day + weekly + monthly summary', () => {
    const output = resolveGranularityPlan({ mode: 'deep', durationDays: 30 });
    expect(output.slots).toEqual(['day']);
    expect(output.summaries).toEqual(['weekly', 'monthly']);
  });

  it('rough: D=30 -> week', () => {
    const output = resolveGranularityPlan({ mode: 'rough', durationDays: 30 });
    expect(output.slots).toEqual(['week']);
    expect(output.summaries).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试，确认红灯**

Run: `corepack pnpm --filter @ai-plan/api exec vitest run tests/plan-granularity.test.ts`  
Expected: FAIL（函数/文件尚不存在）。

- [ ] **Step 3: 最小实现规则引擎**

```ts
export type GranularityMode = 'smart' | 'deep' | 'rough';
export type SlotType = 'day' | 'week' | 'month';
export type SummaryType = 'weekly' | 'monthly';

export function resolveGranularityPlan(input: { mode: GranularityMode; durationDays: number }) {
  const d = Math.max(1, Math.floor(input.durationDays));
  const effectiveMode = input.mode === 'smart' ? (d < 30 ? 'deep' : 'rough') : input.mode;

  if (effectiveMode === 'deep') {
    if (d < 7) return { mode: effectiveMode, slots: ['day'] as SlotType[], summaries: [] as SummaryType[] };
    if (d < 30) return { mode: effectiveMode, slots: ['day'] as SlotType[], summaries: ['weekly'] as SummaryType[] };
    return { mode: effectiveMode, slots: ['day'] as SlotType[], summaries: ['weekly', 'monthly'] as SummaryType[] };
  }

  if (d < 30) return { mode: effectiveMode, slots: ['day'] as SlotType[], summaries: [] as SummaryType[] };
  return { mode: effectiveMode, slots: ['week'] as SlotType[], summaries: [] as SummaryType[] };
}
```

- [ ] **Step 4: 跑测试确认绿灯**

Run: `corepack pnpm --filter @ai-plan/api exec vitest run tests/plan-granularity.test.ts`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/modules/plans/granularity.ts apps/api/tests/plan-granularity.test.ts
git commit -m "feat(api): add basic-plan granularity decision engine"
```

---

### Task 2: 统一时间槽输出与接口扩展（后端集成）

**Files:**
- Modify: `apps/api/src/modules/plans/plan.routes.ts`
- Modify: `apps/api/src/modules/plans/plan.service.ts`
- Modify: `apps/api/tests/plan-generation.test.ts`

- [ ] **Step 1: 扩展创建计划请求体（普通版可带 granularityMode）**

```ts
type CreatePlanBody = {
  goal: string;
  deadline: string;
  requirement: string;
  type: PlanType;
  profile?: {
    planMode: PlanMode;
    basicInfo: {
      // ...
      granularityMode?: 'smart' | 'deep' | 'rough';
    };
  };
};
```

- [ ] **Step 2: 统一草稿快照结构追加 timeSlot 信息**

```ts
type DraftTask = {
  id: string;
  title: string;
  order: number;
  timeSlotType: 'day' | 'week' | 'month';
  timeSlotKey: string;
  taskType: 'action' | 'weekly_summary' | 'monthly_summary';
};
```

- [ ] **Step 3: 在生成阶段按规则填充 timeSlot 字段**

```ts
const rule = resolveGranularityPlan({ mode: granularityMode, durationDays });
// 按 rule.slots / rule.summaries 给每个任务挂 timeSlotType/timeSlotKey/taskType
```

- [ ] **Step 4: 补集成测试（创建后返回结构包含 timeSlot）**

```ts
it('普通版应返回统一时间槽字段', async () => {
  const res = await app.inject({ method: 'POST', url: '/plans', headers, payload: basicPayloadWithGranularity });
  expect(res.statusCode).toBe(201);
  const body = JSON.parse(res.body) as { draft: { versions: Array<{ stages: Array<{ tasks: Array<Record<string, unknown>> }> }> } };
  const firstTask = body.draft.versions[0].stages[0].tasks[0];
  expect(firstTask.timeSlotType).toBeDefined();
  expect(firstTask.timeSlotKey).toBeDefined();
  expect(firstTask.taskType).toBeDefined();
});
```

- [ ] **Step 5: 运行后端测试**

Run: `corepack pnpm --filter @ai-plan/api exec vitest run tests/plan-generation.test.ts tests/plan-granularity.test.ts`  
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add apps/api/src/modules/plans/plan.routes.ts apps/api/src/modules/plans/plan.service.ts apps/api/tests/plan-generation.test.ts
git commit -m "feat(api): emit unified time-slot tasks for basic mode"
```

---

### Task 3: 普通版创建页新增“计划颗粒度”与智能推荐

**Files:**
- Modify: `apps/web-user/src/features/plans/PlanCreatePage.vue`
- Modify: `apps/web-user/src/lib/api-client.ts`
- Modify: `apps/web-user/tests/plan-create-page.test.ts`

- [ ] **Step 1: 创建页表单增加 granularityMode 字段**

```ts
const form = reactive({
  // ...
  granularityMode: 'smart' as 'smart' | 'deep' | 'rough',
});
```

- [ ] **Step 2: 增加智能推荐提示（按周期即时展示）**

```ts
const recommendedMode = computed(() => {
  const days = calcDurationDays(form.startDate, form.endDate, form.cycle);
  return days < 30 ? 'deep' : 'rough';
});
```

- [ ] **Step 3: 创建请求把 granularityMode 传给后端**

```ts
profile: {
  planMode: selectedPlanMode.value,
  basicInfo: {
    // ...
    granularityMode: form.granularityMode,
  },
}
```

- [ ] **Step 4: 测试补充**

```ts
it('普通版提交应携带 granularityMode', async () => {
  // 设置 granularityMode = 'deep'
  // 提交后断言 createPlan payload.profile.basicInfo.granularityMode === 'deep'
});
```

- [ ] **Step 5: 运行前端测试**

Run: `corepack pnpm --filter @ai-plan/web-user exec vitest run tests/plan-create-page.test.ts`  
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add apps/web-user/src/features/plans/PlanCreatePage.vue apps/web-user/src/lib/api-client.ts apps/web-user/tests/plan-create-page.test.ts
git commit -m "feat(web): add granularity mode selector for basic plan creation"
```

---

### Task 4: 草稿确认后切换颗粒度（二次确认 + 新版本）

**Files:**
- Modify: `apps/web-user/src/features/plans/PlanDraftPage.vue`
- Modify: `apps/web-user/tests/plan-draft-page.test.ts`
- Modify: `apps/api/src/modules/plans/plan.routes.ts`

- [ ] **Step 1: 草稿页新增“切换颗粒度”控件与提示**

```vue
<select v-model="nextGranularityMode">
  <option value="smart">智能推荐</option>
  <option value="deep">深度计划</option>
  <option value="rough">粗略计划</option>
</select>
```

- [ ] **Step 2: 若已确认后切换，弹二次确认**

```ts
if (isConfirmed.value && nextGranularityMode.value !== currentGranularityMode.value) {
  openGranularityConfirmModal();
}
```

- [ ] **Step 3: 确认后调用重生成接口并创建新版本**

```ts
await getApiClient().regeneratePlan({
  id: planId.value,
  token: authState.token,
  requirement: selectedSnapshot.value?.requirement,
  granularityMode: nextGranularityMode.value,
});
```

- [ ] **Step 4: 后端 regenerate 接口透传 granularityMode**

```ts
const granularityMode = isRecord(body) && typeof body.granularityMode === 'string' ? body.granularityMode : undefined;
const result = await regeneratePlanVersion(id, payload.sub, requirement, granularityMode);
```

- [ ] **Step 5: 测试补充**

```ts
it('已确认后切换颗粒度应弹二次确认并生成新版本', async () => {
  // 断言 modal 出现 -> 确认 -> regeneratePlan 被调用且带 granularityMode
});
```

- [ ] **Step 6: 运行测试**

Run: `corepack pnpm --filter @ai-plan/web-user exec vitest run tests/plan-draft-page.test.ts`  
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add apps/web-user/src/features/plans/PlanDraftPage.vue apps/web-user/tests/plan-draft-page.test.ts apps/api/src/modules/plans/plan.routes.ts
git commit -m "feat(flow): require confirmation when switching granularity after confirm"
```

---

### Task 5: 全量验证与文档对齐

**Files:**
- Modify: `docs/superpowers/specs/2026-04-10-basic-plan-granularity-design.md`（仅实现差异回写）
- Test: `apps/api/tests/plan-granularity.test.ts`
- Test: `apps/api/tests/plan-generation.test.ts`
- Test: `apps/web-user/tests/plan-create-page.test.ts`
- Test: `apps/web-user/tests/plan-draft-page.test.ts`

- [ ] **Step 1: 后端验证**

Run:
- `corepack pnpm --filter @ai-plan/api typecheck`
- `corepack pnpm --filter @ai-plan/api exec vitest run tests/plan-granularity.test.ts tests/plan-generation.test.ts`

Expected: PASS。

- [ ] **Step 2: 前端验证**

Run:
- `corepack pnpm --filter @ai-plan/web-user typecheck`
- `corepack pnpm --filter @ai-plan/web-user exec vitest run tests/plan-create-page.test.ts tests/plan-draft-page.test.ts tests/submission-flow.test.ts`

Expected: PASS。

- [ ] **Step 3: 手工冒烟**

Run: `corepack pnpm dev:up`  
Checklist:
- 普通版创建页默认智能推荐
- 选择深度/粗略后草稿内容颗粒度变化符合规则
- 已确认后切换颗粒度出现二次确认并新建草稿版本

- [ ] **Step 4: 文档对齐提交**

```bash
git add docs/superpowers/specs/2026-04-10-basic-plan-granularity-design.md
git commit -m "docs: align granularity design spec with implementation"
```

