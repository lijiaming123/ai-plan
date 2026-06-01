# Story 016：举报 API + 管理端举报列表 + 处置动作（unpublish/ban）

| 属性 | 内容 |
|------|------|
| 状态 | **待审批**（2026-05-09） |
| 所属 Feature | `.ai/features/feature-template-reporting.md` |
| 优先级 | P0 |
| 预估 | 3–6 天 |

---

## 1. 目标

- 用户举报：`POST /templates/market/:id/report`（reasonCode、description、evidence?）\n
- 管理端：\n
  - `GET /admin/templates/reports`（分页、按状态/原因筛选）\n
  - 处置动作：unpublish/ban（模板级优先；作者级封禁可后置）\n
- 全链路审计：report 与 moderate 记录到审计日志\n

---

## 2. 验收标准

1. 用户可举报已发布模板；举报后模板仍可见（除非被处置）。\n
2. 管理员可查看举报列表并执行下架/封禁。\n
3. 处置后模板对外不可见且不可套用。\n
4. 举报与处置动作可审计与检索。\n

---

## 3. 测试策略

- API 单测：report 写入、reports 列表、moderate 状态迁移、权限校验\n

---

## 4. 依赖

- Story 013/015（状态机与审核）\n

