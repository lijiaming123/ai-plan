# Plan Archive (M0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `web-user` 里用最小改动把“归档=可恢复的只读冻结”讲清楚（归档前说明、归档成功引导、归档页可回看 FAQ），降低用户理解与误操作成本。

**Architecture:** 仅做前端 UI/文案与轻量交互增强，不改后端 API。复用现有 `UiConfirmDialog`、`okBanner`、归档页 header 区域；新增少量 DOM 节点与 `data-testid` 以便测试。

**Tech Stack:** Vue 3 + Vue Router + Tailwind；测试使用 Vitest + `@vue/test-utils`（现有 `apps/web-user/tests/*`）。

---

## File Structure（将改动锁定到最小范围）

**Modify**
- `ai-plan/apps/web-user/src/features/plans/PlanDetailPage.vue`
  - 在“归档确认弹窗”内增加 3 行说明（归档去向 / 只读限制 / 可恢复）
  - 归档成功后在现有 `okBanner` 提示里增加“去归档看看”操作（跳转 `/archive`）
- `ai-plan/apps/web-user/src/features/archive/ArchivePage.vue`
  - 在页头说明下方增加“了解归档”折叠 FAQ（默认收起）

**Test**
- `ai-plan/apps/web-user/tests/plan-detail-page.test.ts`（新增用例：归档确认弹窗的三行说明 + 成功后“去归档看看”）
- `ai-plan/apps/web-user/tests/plan-archive-page.test.ts`（新增用例：FAQ 默认收起、点击展开后出现关键问答）

---

### Task 1: PlanDetailPage — 归档确认弹窗增加三行说明（归档前预期管理）

**Files:**
- Modify: `ai-plan/apps/web-user/src/features/plans/PlanDetailPage.vue`
- Test: `ai-plan/apps/web-user/tests/plan-detail-page.test.ts`

- [ ] **Step 1: 写一个失败的测试：归档确认弹窗展示三行说明**

在 `tests/plan-detail-page.test.ts` 新增用例（示例代码，按你们现有测试风格直接可用）：

```ts
it("归档确认弹窗应展示归档语义说明（只读 + 可恢复）", async () => {
  const archivePlanMock = vi.fn().mockResolvedValue({ ok: true });
  setApiClient({
    ...createApiClient(),
    getPlan: getPlanMock,
    patchPlanScheduleSlot: patchSlotMock,
    postPlanScheduleSlotCheckin: postCheckinMock,
    publishMarketTemplate: publishMarketTemplateMock,
    patchPlan: patchPlanMock,
    archivePlan: archivePlanMock,
  });

  // 返回 active 计划，确保页面会渲染归档入口（若你们归档入口仅对 active/已定稿开放）
  getPlanMock.mockResolvedValueOnce({
    ...(await getPlanMock.mock.results[0]?.value),
    id: "plan_1",
    status: "active",
  });

  const router = createAppRouter(createMemoryHistory());
  await router.push("/plans/plan_1");
  await router.isReady();

  const wrapper = mount(PlanDetailPage, { global: { plugins: [router] } });
  await flushPromises();

  await wrapper.get('[data-testid="plan-archive"]').trigger("click");
  await flushPromises();

  const dialog = wrapper.get('[data-testid="confirm-archive-dialog"]');
  expect(dialog.text()).toContain("移出「我的计划」");
  expect(dialog.text()).toContain("进入「归档」");
  expect(dialog.text()).toContain("仅可查看");
  expect(dialog.text()).toContain("不能打卡/编辑/申诉");
  expect(dialog.text()).toContain("可随时「移回我的计划」");
});
```

> 备注：如果实际按钮 `data-testid` 不叫 `plan-archive` 或 dialog 不叫 `confirm-archive-dialog`，在写测试前先在组件里补齐/复用现有 `data-testid`（本 Task 的实现步骤里会一起做）。

- [ ] **Step 2: 运行测试确认失败**

Run:
`cd ai-plan/apps/web-user && npm test -- tests/plan-detail-page.test.ts`

Expected:
FAIL（找不到说明文本或找不到对应节点）。

- [ ] **Step 3: 实现最小改动：在归档确认弹窗内加三行说明**

在 `PlanDetailPage.vue` 的归档确认 `UiConfirmDialog` 内，追加一个说明区块（建议加 `data-testid="archive-explain"` 方便测）：

```vue
<div data-testid="archive-explain" class="mt-2 space-y-1 text-xs leading-relaxed text-stone-600">
  <p>归档后会移出「我的计划」，进入「归档」。</p>
  <p>归档后仅可查看，不能打卡/编辑/申诉。</p>
  <p>需要继续时可随时「移回我的计划」。</p>
</div>
```

- [ ] **Step 4: 运行测试确认通过**

Run:
`cd ai-plan/apps/web-user && npm test -- tests/plan-detail-page.test.ts`

Expected:
PASS

- [ ] **Step 5:（可选）补充 typecheck**

Run:
`cd ai-plan/apps/web-user && npm run typecheck`

Expected:
PASS

---

### Task 2: PlanDetailPage — 归档成功提示增加“去归档看看”按钮

**Files:**
- Modify: `ai-plan/apps/web-user/src/features/plans/PlanDetailPage.vue`
- Test: `ai-plan/apps/web-user/tests/plan-detail-page.test.ts`

- [ ] **Step 1: 写一个失败的测试：归档成功后出现“去归档看看”，点击跳转**

```ts
it("归档成功后应提供“去归档看看”快捷入口并能跳转", async () => {
  const archivePlanMock = vi.fn().mockResolvedValue({ ok: true });
  setApiClient({
    ...createApiClient(),
    getPlan: getPlanMock,
    patchPlanScheduleSlot: patchSlotMock,
    postPlanScheduleSlotCheckin: postCheckinMock,
    publishMarketTemplate: publishMarketTemplateMock,
    patchPlan: patchPlanMock,
    archivePlan: archivePlanMock,
  });

  getPlanMock.mockResolvedValueOnce({
    ...(await getPlanMock.mock.results[0]?.value),
    id: "plan_1",
    status: "active",
  });

  const router = createAppRouter(createMemoryHistory());
  await router.push("/plans/plan_1");
  await router.isReady();

  const wrapper = mount(PlanDetailPage, { global: { plugins: [router] } });
  await flushPromises();

  await wrapper.get('[data-testid="plan-archive"]').trigger("click");
  await flushPromises();
  await wrapper.get('[data-testid="confirm-archive-dialog"] [data-testid="ui-confirm-ok"]').trigger("click");
  await flushPromises();

  const banner = wrapper.get('[data-testid="plan-ok-banner"]');
  expect(banner.text()).toContain("已移入归档");
  expect(banner.text()).toContain("去归档看看");

  await wrapper.get('[data-testid="go-archive-from-banner"]').trigger("click");
  expect(router.currentRoute.value.fullPath).toBe("/archive");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
`cd ai-plan/apps/web-user && npm test -- tests/plan-detail-page.test.ts`

Expected:
FAIL（没有按钮/没有跳转）。

- [ ] **Step 3: 实现：把 okBanner 渲染升级为“文案 + 按钮”**

要求：
- 不改变现有 okBanner 的关闭时序（现有 `setTimeout` 保持）。
- 按钮点击后执行 `router.push("/archive")`（或你们侧栏同路由）。
- 增加 `data-testid="go-archive-from-banner"`，便于测试稳定。

- [ ] **Step 4: 运行测试确认通过**

Run:
`cd ai-plan/apps/web-user && npm test -- tests/plan-detail-page.test.ts`

Expected:
PASS

---

### Task 3: ArchivePage — 增加“了解归档”折叠 FAQ（默认收起）

**Files:**
- Modify: `ai-plan/apps/web-user/src/features/archive/ArchivePage.vue`
- Test: `ai-plan/apps/web-user/tests/plan-archive-page.test.ts`

- [ ] **Step 1: 写一个失败的测试：FAQ 默认收起，点击展开后出现关键问答**

在 `tests/plan-archive-page.test.ts` 追加用例（该文件已有 mount/router/mock 模式，可直接复用）：

```ts
it("归档页应提供“了解归档”FAQ（默认收起，可展开查看）", async () => {
  listArchivedPlans.mockResolvedValue({ plans: [], hasMore: false });

  const router = createAppRouter(createMemoryHistory());
  await router.push("/archive");
  await router.isReady();

  const wrapper = mount(ArchivePage, { global: { plugins: [router] } });
  await flushPromises();

  expect(wrapper.find('[data-testid="archive-faq-body"]').exists()).toBe(false);

  await wrapper.get('[data-testid="archive-faq-toggle"]').trigger("click");
  await nextTick();

  const body = wrapper.get('[data-testid="archive-faq-body"]');
  expect(body.text()).toContain("归档和删除有什么区别");
  expect(body.text()).toContain("归档后为什么不能打卡/编辑");
  expect(body.text()).toContain("怎么恢复继续执行");
  expect(body.text()).toContain("归档会丢数据吗");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
`cd ai-plan/apps/web-user && npm test -- tests/plan-archive-page.test.ts`

Expected:
FAIL（找不到 toggle/body 或文本不存在）。

- [ ] **Step 3: 实现：在 header 文案下方增加折叠 FAQ**

实现建议：
- 用一个 `ref(false)` 控制展开：`faqOpen`
- Toggle 按钮：`data-testid="archive-faq-toggle"`
- Body 容器：`data-testid="archive-faq-body"`（仅在 open 时渲染）
- 文案按规格 `ai-plan/.ai/specs/2026-05-09-web-user-plan-archive-m0-commercialization.md` 里的最终版

- [ ] **Step 4: 运行测试确认通过**

Run:
`cd ai-plan/apps/web-user && npm test -- tests/plan-archive-page.test.ts`

Expected:
PASS

---

### Task 4: 回归验证与最小发布检查

**Files:**
- (no code changes)

- [ ] **Step 1: 跑 web-user 全量测试**

Run:
`cd ai-plan/apps/web-user && npm test`

Expected:
PASS（所有 vitest 用例通过）

- [ ] **Step 2: 运行 typecheck**

Run:
`cd ai-plan/apps/web-user && npm run typecheck`

Expected:
PASS

- [ ] **Step 3: 人工冒烟（本地 dev）**

Run:
`cd ai-plan/apps/web-user && npm run dev`

手动检查：
- 在计划详情页点击“归档”前能看到三行说明
- 归档成功 banner 有“去归档看看”，点击跳到归档页
- 归档页 FAQ 默认收起，展开可读且不影响列表/搜索/排序交互

---

## Self-Review（对照规格）

- 覆盖 规格 `ai-plan/.ai/specs/2026-05-09-web-user-plan-archive-m0-commercialization.md` 的 3 个触点：归档前说明、成功引导、归档页 FAQ ✅
- 无占位符（无 TBD/TODO）✅
- 测试与命令明确，预期输出明确 ✅

