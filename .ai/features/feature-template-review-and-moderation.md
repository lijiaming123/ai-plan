# Feature：审核队列与处置（approve/reject/unpublish/ban）+ 审核记录

| 属性 | 内容 |
|------|------|
| 状态 | **待审批**（2026-05-09） |
| 所属 Epic | `.ai/epics/epic-web-user-template-market-ugc.md` |
| 优先级 | P0 |
| 目标产出 | 管理端可审核模板并可追溯；违规可处置（下架/封禁） |

---

## 1. 目标

- 审核队列 API：按状态/时间分页\n
- 审核动作：approve/reject（带 reasonCode + note）\n
- 审核记录：TemplateReviewLog（或等价结构）\n
- 处置动作：unpublish/ban/unban（模板/作者层级策略待决策）\n
- 所有动作写审计\n

---

## 2. 验收标准

1. 审核员可查询待审列表，并能 approve/reject。\n
2. 驳回必须带 reasonCode；作者能看到驳回原因摘要。\n
3. 处置后模板对外不可见且不可套用。\n
4. 审核与处置动作在审计日志中可查询。\n

---

## 3. 关联 Stories（建议）

- Story 015：审核队列 + approve/reject + 审核记录\n
- Story 016：处置动作（unpublish/ban）与权限\n

