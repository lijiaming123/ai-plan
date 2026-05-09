# Feature：模板状态机与作者侧生命周期（publish/edit/unpublish）

| 属性 | 内容 |
|------|------|
| 状态 | **待审批**（2026-05-09） |
| 所属 Epic | `.ai/epics/epic-web-user-template-market-ugc.md` |
| 优先级 | P0 |
| 目标产出 | 发布可控（待审）+ 作者可管理（状态可见、可编辑、可下架） |

---

## 1. 目标

- MarketTemplate 引入状态机：`pending_review/published/rejected/unpublished/banned`（至少覆盖 P0）\n
- 发布默认进入待审；公开市场仅展示 `published`\n
- 作者侧：\n
  - 在“我的模板(created)”看到状态与审核反馈摘要\n
  - 支持下架（unpublish）\n
  - 支持编辑元信息（title/summary/category/tags）并触发重新审核\n

---

## 2. 验收标准

1. `POST /templates/market` 不再直接上线；写入 `pending_review`。\n
2. `GET /templates/market` 只返回 `published`。\n
3. 作者可下架自己模板，下架后对外不可见且不可套用。\n
4. 作者编辑元信息后状态回到待审，审核结果可见。\n

---

## 3. 关联 Stories（建议）

- Story 013：状态机 + 发布待审 + 公开列表过滤\n
- Story 014：作者侧管理（状态展示/下架/编辑）\n

