# Feature：模板域审计与埋点口径（publish/review/unpublish/apply/report）

| 属性 | 内容 |
|------|------|
| 状态 | **待审批**（2026-05-09） |
| 所属 Epic | `.ai/epics/epic-web-user-template-market-ugc.md` |
| 优先级 | P0 |
| 目标产出 | 关键行为全量可追溯，指标口径可对接 Analytics |

---

## 1. 目标

- 审计：对模板域关键动作写入 AuditLog（或等价表/服务）\n
- 埋点：统一事件口径（web-user + api），至少包括：\n
  - `template_publish`（已存在，补齐字段）\n
  - `template_review`（approve/reject + reasonCode）\n
  - `template_unpublish`（作者/管理员）\n
  - `template_apply`（source=preset/market + versionId 可选）\n
  - `template_report`（reasonCode）\n
- 为后续漏斗：发布→审核通过→曝光→套用，提供可计算字段\n

---

## 2. 验收标准

1. 上述关键动作均可在审计日志查询到（含操作者、对象、时间、原因码）。\n
2. 埋点事件属性满足后续漏斗计算（templateId、versionId、planId、actorRole 等）。\n

---

## 3. 关联 Stories（建议）

- Story 017：模板域审计与埋点口径统一\n

