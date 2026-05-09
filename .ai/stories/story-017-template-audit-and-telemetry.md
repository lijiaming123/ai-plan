# Story 017：模板域审计与埋点口径统一（publish/review/unpublish/apply/report）

| 属性 | 内容 |
|------|------|
| 状态 | **待审批**（2026-05-09） |
| 所属 Feature | `.ai/features/feature-template-audit-telemetry.md` |
| 优先级 | P0 |
| 预估 | 2–4 天 |

---

## 1. 目标

- 审计（后端）：关键动作写入审计日志（或等价机制）：\n
  - template_publish（含 templateId、planId/payloadHash、status）\n
  - template_review（approve/reject + reasonCode）\n
  - template_unpublish（actor=author/admin）\n
  - template_apply（source=preset/market + planId + templateId + versionId?）\n
  - template_report（reasonCode）\n
- 埋点（前端/后端口径对齐）：\n
  - 补齐 web-user 已存在的 `template_publish` / `template_use`\n
  - 新增或补齐 review/unpublish/report 的埋点属性\n

---

## 2. 验收标准

1. 上述关键动作均能在审计日志查询到。\n
2. 埋点事件属性可支持后续漏斗：发布→通过→曝光→套用。\n

---

## 3. 测试策略

- API 单测：触发动作后审计表/写入函数被调用（或落库可查）\n

---

## 4. 依赖

- Story 013/015/016 的动作与状态机\n
- 既有审计基础设施（若存在则复用）\n

