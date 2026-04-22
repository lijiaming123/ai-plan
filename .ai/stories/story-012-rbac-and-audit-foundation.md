# Story 012：RBAC 权限点接入 + 审计日志基础设施

| 属性 | 内容 |
|------|------|
| 状态 | **待审批**（2026-04-22） |
| 所属 Feature | `.ai/features/feature-rbac-audit.md` |
| 优先级 | P0 |
| 预估 | 2–3 天 |

---

## 1. 目标

提供管理端最小 RBAC 与审计能力，为 analytics 与用户模块兜底：

- 权限点：`analytics:read`、`analytics:export`、`users:read`、`audit:read`、`rbac:manage`
- 审计日志：提供写入封装与查询接口

---

## 2. 验收标准

1. 无对应权限访问 analytics/admin 路由返回 403。
2. 审计日志可记录：导出、权限变更、drill-down 查询（条件摘要）。
3. 审计查询接口支持时间范围与操作者过滤。

---

## 3. 测试策略

- API 单测：权限校验（403）与审计写入。

---

## 4. 依赖

- 管理端登录/鉴权（若已存在则复用）

