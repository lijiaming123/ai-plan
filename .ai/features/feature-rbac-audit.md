# Feature：RBAC 与审计（analytics 导出/敏感查询）

| 属性 | 内容 |
|------|------|
| 状态 | **待审批**（2026-04-22） |
| 所属 Epic | `.ai/epics/epic-web-admin-growth-analytics.md` |
| 优先级 | P0 |
| 目标产出 | 管理端权限控制与关键操作可追溯 |

---

## 1. 目标

- 角色/权限点控制：`analytics:read`、`analytics:export`、`users:read`、`audit:read`、`rbac:manage`
- 审计日志：导出、封禁、权限变更、敏感查询（drill-down）记录

---

## 2. 验收标准

1. 无 `analytics:read` 权限无法访问分析页面与接口（403）。
2. 导出必须具备 `analytics:export`，且审计日志可查询到记录。
3. drill-down（用户级查询）写审计（最小字段：操作者、时间、条件摘要、结果量级）。

---

## 3. 关联 Stories（建议）

- S1：RBAC 权限点与中间件接入 analytics/admin 路由
- S2：审计日志表与写入封装
- S3：web-admin 审计日志查看页（P1 可做，P0 先有查询接口）

