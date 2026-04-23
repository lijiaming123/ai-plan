# Plan Draft Content Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在计划草稿页支持“交换两个日期的计划内容”，仅互换 `content`，不改变 `slotKey`、日期归属和后续通知/打卡链路。  

**Architecture:** 后端新增一个原子交换接口，接收两个 `slotKey` 并在同一次更新中交换它们的 `content`。前端仅在草稿页表格/卡片中增加“交换内容”入口与确认弹窗，调用新接口后就地替换当前版本的 `schedule`，不触碰执行态和通知模型。  

**Tech Stack:** Vue 3 + TypeScript + Element Plus + Vitest，Fastify + TypeScript + Vitest。

---

## File Structure Map

- Modify: `apps/api/src/modules/plans/plan.service.ts`（新增草稿 schedule 内容交换 service）
- Modify: `apps/api/src/modules/plans/plan.routes.ts`（新增 `swap-content` 路由）
- Modify: `apps/api/tests/plan-schedule-edit.test.ts`（后端交换接口测试）
- Modify: `apps/web-user/src/lib/api-client.ts`（新增 `postPlanScheduleSwapContent`）
- Modify: `apps/web-user/src/features/plans/PlanDraftPage.vue`（新增交换内容按钮、弹窗、状态更新）
- Modify: `apps/web-user/tests/plan-draft-page.test.ts`（草稿页交换内容交互测试）

不改：

- `apps/web-user/src/features/plans/PlanDetailPage.vue`（本期不在执行态开放）
- 通知中心、打卡提交、申诉相关文件（本期不改变 `slotKey` 链路）

---

### Task 1: 后端先写失败测试，锁定“交换内容但不改 slotKey”的行为

**Files:**
- Modify: `apps/api/tests/plan-schedule-edit.test.ts`
- Test: `apps/api/tests/plan-schedule-edit.test.ts`

- [ ] **Step 1: 添加失败测试：两个 slot 的内容应互换，slotKey 保持不变**

```ts
it('应支持交换两个 slot 的内容且保持 slotKey 不变', async () => {
  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
  });
  const { token } = JSON.parse(login.body) as { token: string };

  const requirementWithJson = [
    '正文',
    '```json',
    JSON.stringify({
      schedule: {
        granularity: 'day',
        slots: [
          { slotKey: '2026-04-10', content: 'D1：阅读第一章。' },
          { slotKey: '2026-04-11', content: 'D2：完成练习题。' },
        ],
      },
    }),
    '```',
  ].join('\n');

  const created = await app.inject({
    method: 'POST',
    url: '/plans',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      goal: '测试交换内容',
      deadline: '2026-04-11T00:00:00.000Z',
      requirement: requirementWithJson,
      type: 'general',
      profile: {
        planMode: 'basic',
        basicInfo: {
          planName: '测试交换内容',
          planContent: '测试',
          currentLevel: 'none',
          startDate: '2026-04-10',
          cycle: 'custom',
          endDate: '2026-04-11',
          preference: '',
          timeInvestment: 'none',
          outputMode: 'daily',
          granularityMode: 'deep',
        },
      },
    },
  });
  const plan = JSON.parse(created.body) as { id: string };

  const swap = await app.inject({
    method: 'POST',
    url: `/plans/${plan.id}/schedule/slots/swap-content`,
    headers: { authorization: `Bearer ${token}` },
    payload: { slotKeyA: '2026-04-10', slotKeyB: '2026-04-11' },
  });

  expect(swap.statusCode).toBe(200);
  const body = JSON.parse(swap.body) as {
    schedule: { slots: Array<{ slotKey: string; content: string }> };
  };
  expect(body.schedule.slots.find((s) => s.slotKey === '2026-04-10')?.content).toBe('D2：完成练习题。');
  expect(body.schedule.slots.find((s) => s.slotKey === '2026-04-11')?.content).toBe('D1：阅读第一章。');
});
```

- [ ] **Step 2: 添加失败测试：相同 slotKey 不允许交换**

```ts
it('同一个 slotKey 不能和自己交换', async () => {
  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
  });
  const { token } = JSON.parse(login.body) as { token: string };

  const created = await app.inject({
    method: 'POST',
    url: '/plans',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      goal: '测试非法交换',
      deadline: '2026-04-11T00:00:00.000Z',
      requirement: '```json\n{"schedule":{"granularity":"day","slots":[{"slotKey":"2026-04-10","content":"A"}]}}\n```',
      type: 'general',
      profile: {
        planMode: 'basic',
        basicInfo: {
          planName: '测试非法交换',
          planContent: '测试',
          currentLevel: 'none',
          startDate: '2026-04-10',
          cycle: 'custom',
          endDate: '2026-04-11',
          preference: '',
          timeInvestment: 'none',
          outputMode: 'daily',
          granularityMode: 'deep',
        },
      },
    },
  });
  const plan = JSON.parse(created.body) as { id: string };

  const swap = await app.inject({
    method: 'POST',
    url: `/plans/${plan.id}/schedule/slots/swap-content`,
    headers: { authorization: `Bearer ${token}` },
    payload: { slotKeyA: '2026-04-10', slotKeyB: '2026-04-10' },
  });

  expect(swap.statusCode).toBe(400);
  expect(JSON.parse(swap.body).message).toContain('slot keys must be different');
});
```

- [ ] **Step 3: 添加失败测试：带 version 时应只修改对应草稿版本**

```ts
it('草稿多版本时应只交换指定 version 的 schedule 内容', async () => {
  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: 'demo@ai-plan.dev', password: 'Pass1234!' },
  });
  const { token } = JSON.parse(login.body) as { token: string };

  const requirementWithJson = [
    '正文',
    '```json',
    JSON.stringify({
      schedule: {
        granularity: 'day',
        slots: [
          { slotKey: '2026-04-10', content: 'D1：阅读第一章。' },
          { slotKey: '2026-04-11', content: 'D2：完成练习题。' },
        ],
      },
    }),
    '```',
  ].join('\n');

  const created = await app.inject({
    method: 'POST',
    url: '/plans',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      goal: '测试多版本交换内容',
      deadline: '2026-04-11T00:00:00.000Z',
      requirement: requirementWithJson,
      type: 'general',
      profile: {
        planMode: 'basic',
        basicInfo: {
          planName: '测试多版本交换内容',
          planContent: '测试',
          currentLevel: 'none',
          startDate: '2026-04-10',
          cycle: 'custom',
          endDate: '2026-04-11',
          preference: '',
          timeInvestment: 'none',
          outputMode: 'daily',
          granularityMode: 'deep',
        },
      },
    },
  });
  const plan = JSON.parse(created.body) as { id: string };

  await app.inject({
    method: 'POST',
    url: `/plans/${plan.id}/regenerate`,
    headers: { authorization: `Bearer ${token}` },
    payload: {},
  });

  const swap = await app.inject({
    method: 'POST',
    url: `/plans/${plan.id}/schedule/slots/swap-content`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      slotKeyA: '2026-04-10',
      slotKeyB: '2026-04-11',
      version: 2,
    },
  });

  expect(swap.statusCode).toBe(200);

  const fetched = await app.inject({
    method: 'GET',
    url: `/plans/${plan.id}/draft`,
    headers: { authorization: `Bearer ${token}` },
  });
  const draft = JSON.parse(fetched.body) as {
    versions: Array<{ version: number; schedule?: { slots: Array<{ slotKey: string; content: string }> } }>;
  };
  const v1 = draft.versions.find((v) => v.version === 1)!;
  const v2 = draft.versions.find((v) => v.version === 2)!;
  expect(v1.schedule?.slots.find((s) => s.slotKey === '2026-04-10')?.content).toBe('D1：阅读第一章。');
  expect(v2.schedule?.slots.find((s) => s.slotKey === '2026-04-10')?.content).toBe('D2：完成练习题。');
});
```

- [ ] **Step 4: 运行后端测试，确认新增用例先失败**

Run: `corepack pnpm --filter @ai-plan/api test -- plan-schedule-edit.test.ts`  
Expected: 新增的 `swap-content` 用例 FAIL（路由或 service 尚未实现）。

- [ ] **Step 5: Commit**

```bash
git add apps/api/tests/plan-schedule-edit.test.ts
git commit -m "test(api): cover draft schedule content swap"
```

---

### Task 2: 实现后端原子交换接口

**Files:**
- Modify: `apps/api/src/modules/plans/plan.service.ts`
- Modify: `apps/api/src/modules/plans/plan.routes.ts`
- Test: `apps/api/tests/plan-schedule-edit.test.ts`

- [ ] **Step 1: 在 service 中新增交换函数**

```ts
export async function swapPlanScheduleSlotContent(params: {
  planId: string;
  userId: string;
  slotKeyA: string;
  slotKeyB: string;
  version?: number;
}) {
  const { planId, userId, slotKeyA, slotKeyB, version } = params;
  if (slotKeyA === slotKeyB) {
    return { ok: false as const, code: 400 as const, message: 'slot keys must be different' };
  }

  const plan = await prisma.plan.findFirst({ where: { id: planId, userId } });
  if (!plan) return { ok: false as const, code: 404 as const, message: 'plan not found' };

  const state = await loadDraftState(plan);
  const targetVersion =
    typeof version === 'number'
      ? state.versions.find((v) => v.version === version)
      : state.versions.find((v) => v.version === (state.confirmedVersion ?? plan.currentVersion ?? 1));

  if (!targetVersion?.schedule?.slots?.length) {
    return { ok: false as const, code: 400 as const, message: 'schedule not found' };
  }

  const nextSlots = targetVersion.schedule.slots.map((slot) => ({ ...slot }));
  const a = nextSlots.find((slot) => slot.slotKey === slotKeyA);
  const b = nextSlots.find((slot) => slot.slotKey === slotKeyB);
  if (!a || !b) return { ok: false as const, code: 404 as const, message: 'slot not found' };

  const nextA = a.content;
  a.content = b.content;
  b.content = nextA;
  a.contentSource = 'edited';
  b.contentSource = 'edited';

  const updated = await saveDraftVersionSchedule({
    plan,
    version: targetVersion.version,
    schedule: { ...targetVersion.schedule, slots: nextSlots },
  });

  return {
    ok: true as const,
    schedule: updated.schedule,
    swapped: {
      slotKeyA,
      slotKeyB,
    },
  };
}
```

- [ ] **Step 2: 在 routes 中新增交换接口**

```ts
fastify.post(
  '/plans/:id/schedule/slots/swap-content',
  { preHandler: fastify.requireRole('user') },
  async (request, reply) => {
    const payload = await request.jwtVerify<{ sub: string }>();
    const { id } = request.params as { id: string };
    const body = normalizeBody(request.body) as {
      slotKeyA?: string;
      slotKeyB?: string;
      version?: number;
    };

    const slotKeyA = typeof body.slotKeyA === 'string' ? body.slotKeyA.trim() : '';
    const slotKeyB = typeof body.slotKeyB === 'string' ? body.slotKeyB.trim() : '';
    if (!slotKeyA || !slotKeyB) {
      return reply.code(400).send({ message: 'slotKeyA and slotKeyB are required' });
    }

    const result = await swapPlanScheduleSlotContent({
      planId: id,
      userId: payload.sub,
      slotKeyA,
      slotKeyB,
      version: typeof body.version === 'number' ? body.version : undefined,
    });
    if (!result.ok) return reply.code(result.code).send({ message: result.message });
    return reply.send(result);
  },
);
```

- [ ] **Step 3: 运行后端测试确认通过**

Run: `corepack pnpm --filter @ai-plan/api test -- plan-schedule-edit.test.ts`  
Expected: PASS（原有单项编辑/恢复用例 + 新增交换内容用例全部通过）。

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/plans/plan.service.ts apps/api/src/modules/plans/plan.routes.ts
git commit -m "feat(api): add draft schedule content swap endpoint"
```

---

### Task 3: 前端 API 客户端与草稿页交互

**Files:**
- Modify: `apps/web-user/src/lib/api-client.ts`
- Modify: `apps/web-user/src/features/plans/PlanDraftPage.vue`
- Test: `apps/web-user/tests/plan-draft-page.test.ts`

- [ ] **Step 1: 在 api-client 中新增交换内容接口**

```ts
postPlanScheduleSwapContent(input: {
  id: string;
  token: string;
  slotKeyA: string;
  slotKeyB: string;
  version?: number;
}) {
  return request<{
    schedule: NonNullable<
      NonNullable<PlanRecord["draft"]>["versions"][number]["schedule"]
    >;
    swapped: { slotKeyA: string; slotKeyB: string };
  }>(`/plans/${input.id}/schedule/slots/swap-content`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.token}` },
    body: JSON.stringify({
      slotKeyA: input.slotKeyA,
      slotKeyB: input.slotKeyB,
      version: input.version,
    }),
  });
}
```

- [ ] **Step 2: 在草稿页增加交换状态与弹窗模型**

```ts
const scheduleSwapOpen = ref(false);
const scheduleSwapVersion = ref<number | null>(null);
const scheduleSwapSourceKey = ref('');
const scheduleSwapTargetKey = ref('');
const scheduleSwapSaving = ref(false);

function openScheduleSwap(slotKey: string, version: number) {
  scheduleSwapSourceKey.value = slotKey;
  scheduleSwapTargetKey.value = '';
  scheduleSwapVersion.value = version;
  scheduleSwapOpen.value = true;
}

const scheduleSwapSourceSlot = computed(() => {
  const version = scheduleSwapVersion.value;
  const key = scheduleSwapSourceKey.value;
  const snapshot = draftMeta.value?.versions.find((v) => v.version === version);
  return snapshot?.schedule?.slots.find((slot) => slot.slotKey === key) ?? null;
});

const scheduleSwapTargetSlot = computed(() => {
  const version = scheduleSwapVersion.value;
  const key = scheduleSwapTargetKey.value;
  const snapshot = draftMeta.value?.versions.find((v) => v.version === version);
  return snapshot?.schedule?.slots.find((slot) => slot.slotKey === key) ?? null;
});
```

- [ ] **Step 3: 在草稿页实现确认交换逻辑**

```ts
async function confirmScheduleSwap() {
  if (!authState.token) return;
  const version = scheduleSwapVersion.value;
  const slotKeyA = scheduleSwapSourceKey.value;
  const slotKeyB = scheduleSwapTargetKey.value;
  if (!slotKeyA || !slotKeyB || version == null) return;

  scheduleSwapSaving.value = true;
  try {
    const res = await getApiClient().postPlanScheduleSwapContent({
      id: planId.value,
      token: authState.token,
      slotKeyA,
      slotKeyB,
      version,
    });

    const idx = draftMeta.value?.versions.findIndex((v) => v.version === version) ?? -1;
    if (idx >= 0 && draftMeta.value) {
      draftMeta.value.versions[idx] = {
        ...draftMeta.value.versions[idx],
        schedule: res.schedule,
      };
    }

    scheduleSwapOpen.value = false;
  } catch (e) {
    showError(e instanceof Error ? e.message : '交换失败');
  } finally {
    scheduleSwapSaving.value = false;
  }
}
```

- [ ] **Step 4: 在桌面表格与移动卡片加 `交换内容` 入口**

```vue
<button
  type="button"
  class="rounded-lg border border-[#dbe6df] bg-white px-2.5 py-1 text-xs font-semibold text-[#111813] hover:bg-[#f6f8f6] disabled:opacity-50"
  :disabled="scheduleSaving"
  data-testid="schedule-slot-swap"
  @click="openScheduleSwap(slot.slotKey, ver.version)"
>
  交换内容
</button>
```

```vue
<div
  v-if="scheduleSwapOpen"
  class="draft-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
  data-testid="draft-schedule-swap-dialog"
  @click.self="scheduleSwapOpen = false"
>
  <div class="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl" @click.stop>
    <h3 class="text-base font-bold">交换计划内容</h3>
    <p class="mt-1 text-xs text-[#61896f]">仅交换内容，不改变日期归属与后续打卡键。</p>

    <div class="mt-4 grid gap-4">
      <div class="rounded-xl border border-slate-200 bg-[#fbfcfb] p-3">
        <p class="text-xs font-semibold text-[#61896f]">当前日期</p>
        <p class="mt-1 font-mono text-xs font-bold text-[#2a3832]">{{ scheduleSwapSourceSlot?.slotKey }}</p>
        <p class="mt-2 whitespace-pre-wrap text-sm text-[#111813]">{{ scheduleSwapSourceSlot?.content }}</p>
      </div>

      <label class="block">
        <span class="mb-1.5 block text-xs font-semibold text-[#5c6d62]">目标日期</span>
        <UiSunriseSelect v-model="scheduleSwapTargetKey">
          <ElOption
            v-for="slot in draftMeta?.versions.find((v) => v.version === scheduleSwapVersion)?.schedule?.slots ?? []"
            :key="slot.slotKey"
            :label="slot.slotKey"
            :value="slot.slotKey"
            :disabled="slot.slotKey === scheduleSwapSourceKey"
          />
        </UiSunriseSelect>
      </label>

      <div v-if="scheduleSwapTargetSlot" class="rounded-xl border border-slate-200 bg-[#fbfcfb] p-3">
        <p class="text-xs font-semibold text-[#61896f]">目标内容</p>
        <p class="mt-1 font-mono text-xs font-bold text-[#2a3832]">{{ scheduleSwapTargetSlot.slotKey }}</p>
        <p class="mt-2 whitespace-pre-wrap text-sm text-[#111813]">{{ scheduleSwapTargetSlot.content }}</p>
      </div>
    </div>

    <div class="mt-5 flex justify-end gap-2">
      <button type="button" class="rounded-lg px-4 py-2 text-sm font-semibold text-[#61896f]" @click="scheduleSwapOpen = false">
        取消
      </button>
      <button
        type="button"
        class="rounded-lg bg-[#111813] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        :disabled="!scheduleSwapTargetKey || scheduleSwapSaving"
        data-testid="draft-schedule-swap-submit"
        @click="confirmScheduleSwap"
      >
        {{ scheduleSwapSaving ? '交换中…' : '确认交换' }}
      </button>
    </div>
  </div>
</div>
```

- [ ] **Step 5: 添加前端交互测试**

```ts
it('草稿页应支持交换两个日期的计划内容', async () => {
  getPlanDraftMock.mockResolvedValueOnce({
    goal: '测试目标',
    deadline: new Date().toISOString(),
    type: 'general',
    requirement: '',
    ...draftPayload,
    versions: [
      {
        ...draftPayload.versions[0],
        schedule: {
          granularity: 'day',
          slots: [
            { slotKey: '2026-04-10', generatedContent: 'A', content: 'D1：阅读第一章。', contentSource: 'generated' },
            { slotKey: '2026-04-11', generatedContent: 'B', content: 'D2：完成练习题。', contentSource: 'generated' },
          ],
        },
      },
    ],
  });

  const swapMock = vi.fn().mockResolvedValue({
    schedule: {
      granularity: 'day',
      slots: [
        { slotKey: '2026-04-10', generatedContent: 'A', content: 'D2：完成练习题。', contentSource: 'edited' },
        { slotKey: '2026-04-11', generatedContent: 'B', content: 'D1：阅读第一章。', contentSource: 'edited' },
      ],
    },
    swapped: { slotKeyA: '2026-04-10', slotKeyB: '2026-04-11' },
  });
  vi.mocked(getApiClient).mockReturnValue({
    ...createApiClient(),
    getPlanDraft: getPlanDraftMock,
    postPlanScheduleSwapContent: swapMock,
  } as ReturnType<typeof createApiClient>);

  const router = createAppRouter(createMemoryHistory());
  await router.push('/plans/plan_1/draft');
  await router.isReady();

  const wrapper = mount(PlanDraftPage, { global: { plugins: [router] }, attachTo: document.body });
  await flushPromises();

  await wrapper.get('[data-testid="schedule-slot-swap"]').trigger('click');
  await flushPromises();
  expect(document.querySelector('[data-testid="draft-schedule-swap-dialog"]')).not.toBeNull();

  const select = wrapper.findComponent({ name: 'ElSelect' });
  await select.vm.$emit('update:modelValue', '2026-04-11');
  (
    document.querySelector('[data-testid="draft-schedule-swap-submit"]') as HTMLButtonElement
  )?.click();
  await flushPromises();

  expect(swapMock).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'plan_1',
      slotKeyA: '2026-04-10',
      slotKeyB: '2026-04-11',
      version: 1,
    }),
  );
  expect(wrapper.text()).toContain('D2：完成练习题。');
  expect(wrapper.text()).toContain('D1：阅读第一章。');
});
```

- [ ] **Step 6: 运行前端测试确认通过**

Run: `corepack pnpm --filter @ai-plan/web-user test -- plan-draft-page.test.ts`  
Expected: PASS（既有草稿页测试 + 新增交换内容测试通过）。

- [ ] **Step 7: Commit**

```bash
git add apps/web-user/src/lib/api-client.ts apps/web-user/src/features/plans/PlanDraftPage.vue apps/web-user/tests/plan-draft-page.test.ts
git commit -m "feat(web): support swapping draft schedule content"
```

---

### Task 4: 回归验证与文档收尾

**Files:**
- Test: `apps/api/tests/plan-schedule-edit.test.ts`
- Test: `apps/web-user/tests/plan-draft-page.test.ts`

- [ ] **Step 1: 跑后端与前端目标测试**

Run: `corepack pnpm --filter @ai-plan/api test -- plan-schedule-edit.test.ts && corepack pnpm --filter @ai-plan/web-user test -- plan-draft-page.test.ts`  
Expected: PASS。

- [ ] **Step 2: 跑类型检查**

Run: `corepack pnpm --filter @ai-plan/api typecheck && corepack pnpm --filter @ai-plan/web-user typecheck`  
Expected: PASS。

- [ ] **Step 3: 手动验收草稿页交换流程**

Run:

```bash
corepack pnpm dev:up
```

Expected:
- 创建计划后进入草稿页
- 草稿表格中可见 `交换内容`
- 选择目标日期后确认，两个日期内容互换
- 文案提示“仅交换内容，不改变日期归属与后续打卡键”

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/plans/plan.service.ts apps/api/src/modules/plans/plan.routes.ts apps/api/tests/plan-schedule-edit.test.ts apps/web-user/src/lib/api-client.ts apps/web-user/src/features/plans/PlanDraftPage.vue apps/web-user/tests/plan-draft-page.test.ts
git commit -m "feat: support swapping draft schedule content"
```

---

## Self-Review

### Spec coverage

- 草稿期开放：Task 3 只在 `PlanDraftPage.vue` 增加入口，未触碰执行态页面。
- 只交换内容、不改 `slotKey`：Task 2 service 明确只交换 `content`，测试断言保留 `slotKey`。
- 原子接口：Task 2 新增单独后端接口，而不是两次 patch。
- 目标预览与确认：Task 3 弹窗包含当前内容、目标日期与目标内容预览。
- 测试：Task 1/3/4 覆盖 API、前端、类型检查和手动验收。

### Placeholder scan

- 无 `TODO` / `TBD`
- 每个实现步骤都给出具体代码或具体命令

### Type consistency

- API 名称统一为 `postPlanScheduleSwapContent`
- 请求字段统一为 `slotKeyA` / `slotKeyB` / `version`
- 产品术语统一为“交换内容”，不混用“排序/重排/拖拽”

