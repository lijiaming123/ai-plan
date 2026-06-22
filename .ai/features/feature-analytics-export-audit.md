# Feature：分析 CSV 导出与审计兑现

| 属性 | 内容 |
|------|------|
| 状态 | **已批准**（2026-06-01） |
| 所属 Epic | `.ai/epics/epic-web-admin-role-governance.md` |
| 优先级 | P0 |
| 目标产出 | 漏斗/留存/路径导出 + `analytics:export` 校验 |

---

## 1. 目标

- 前端：三分析页增加「导出 CSV」按钮，无 export 权限时 disabled + tooltip。
- 后端（可选 v1）：导出可走纯前端 JSON→CSV；写审计调用 `POST /admin/audit-logs` 内部 service 或 analytics 路由内 `writeAuditLog`。
- 审计 action：`analytics.export`，summary 含报表类型、时间范围、行数。

---

## 2. 验收标准

1. analyst preset（含 export）可导出；仅 read 不可。
2. 每次导出产生一条 audit_log。
3. CSV 列与页面展示字段一致，UTF-8 BOM 兼容 Excel。

---

## 3. 关联 Stories

- Story 016：分析 CSV 导出 + 审计
