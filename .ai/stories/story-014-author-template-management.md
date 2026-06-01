# Story 014：作者侧模板管理（我的模板含状态、下架、编辑触发重审）

| 属性 | 内容 |
|------|------|
| 状态 | **待审批**（2026-05-09） |
| 所属 Feature | `.ai/features/feature-template-governance-lifecycle.md` |
| 优先级 | P0 |
| 预估 | 2–4 天 |

---

## 1. 目标

- API：\n
  - 扩展 `GET /templates/my/market`（created scope）支持返回状态与审核摘要（例如 `status/rejectReason`）\n
  - 新增 `POST /templates/market/:id/unpublish`（作者下架）\n
  - 新增 `PATCH /templates/market/:id`（编辑元信息触发重新审核）\n
- web-user：\n
  - `TemplatesPage.vue` 的“我的模板（created）”展示状态与可操作按钮（下架/编辑/重提）\n
  - 驳回原因可见（摘要）\n

---

## 2. 验收标准

1. 作者在“我的模板 created”能看到待审/驳回/已发布/已下架。\n
2. 作者可下架：下架后公开市场不可见且不可套用。\n
3. 作者可编辑元信息：编辑后回到待审；通过后公开信息更新。\n

---

## 3. 测试策略

- API 单测：权限（仅作者）+ 状态迁移（unpublish/edit）\n
- web-user 测试：补齐 templates 页的状态展示与操作按钮（Vitest）\n

---

## 4. 依赖

- Story 013 状态机基础\n

