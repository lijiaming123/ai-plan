# Feature：审计员工作台增强

| 属性 | 内容 |
|------|------|
| 状态 | **已批准**（2026-06-01） |
| 所属 Epic | `.ai/epics/epic-web-admin-role-governance.md` |
| 优先级 | P0 |
| 目标产出 | 审计首页 + 审计 CSV 导出 |

---

## 1. 目标

- 审计员默认 landing 为 `/admin/audit-logs`。
- 页顶摘要：今日条数、高风险 action 计数、最近导出行（若有）。
- 高风险 action 字典（前端常量）：`rbac.*`, `analytics.export`, `rules.update` 等。
- 有 `analytics:export` 时支持当前筛选结果导出 CSV（action=`audit.export`）。

---

## 2. 验收标准

1. auditor 登录不进 dashboard。
2. 摘要区与列表筛选联动。
3. 审计导出写 audit_log（meta 含 filter 摘要）。

---

## 3. 关联 Stories

- Story 017：审计员工作台 + 审计导出
