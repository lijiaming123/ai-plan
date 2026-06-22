# Story 020：规则编辑 + 审计（P1）

| 属性 | 内容 |
|------|------|
| 状态 | **待办** |
| 所属 Feature | `.ai/features/feature-rules-editable.md`（待创建） |
| 优先级 | P1 |
| 预估 | 1 天 |

---

## 1. 目标

规则页从只读升级为超管可编辑阈值，写审计 `rules.update`。

---

## 2. 任务清单

- [ ] `PATCH /admin/rules/:key` — `rbac:manage`
- [ ] RulesPage 行内编辑 + 保存
- [ ] 审计 + API 单测

---

## 3. 依赖

- Story 014（writeAuditLog）
