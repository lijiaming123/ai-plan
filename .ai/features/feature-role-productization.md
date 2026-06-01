# Feature：角色产品化（路由 / 导航 / 总览分化）

| 属性 | 内容 |
|------|------|
| 状态 | **已批准**（2026-06-01） |
| 所属 Epic | `.ai/epics/epic-web-admin-role-governance.md` |
| 优先级 | P0 |
| 目标产出 | 三类角色登录体验与 PRD 矩阵一致 |

---

## 1. 目标

- 将 `admin-access.ts` 从「权限反推标签」升级为 **角色包驱动** 的配置源。
- 实现按角色的默认首页、侧栏过滤、总览模块 `v-if` 策略。
- 调整 `auditor` preset：移除默认 `analytics:read`。

---

## 2. 验收标准

1. `getDefaultAdminPath`：super-admin/analyst → dashboard；auditor → audit-logs。
2. `adminNavItems` 按 permissions 过滤，auditor 不见漏斗/留存/路径（无 analytics:read 时）。
3. `DashboardPage` 分三块：超管值班台 / 运营增长摘要 / 无 analytics 时不渲染 dashboard 路由。
4. `getAdminRoleLabel` 优先读 preset 匹配（permissions 集合相等），再 fallback 自定义。

---

## 3. 关联 Stories

- Story 013：角色配置与默认 landing
