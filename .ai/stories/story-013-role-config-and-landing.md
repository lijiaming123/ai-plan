# Story 013：角色配置与默认 landing

| 属性 | 内容 |
|------|------|
| 状态 | **已完成**（2026-06-01） |
| 所属 Feature | `.ai/features/feature-role-productization.md` |
| 优先级 | P0 |
| 预估 | 1 天 |

---

## 1. 目标

重构 `admin-access.ts` 与路由逻辑，使三类角色登录后首页、导航、总览模块符合 PRD 矩阵。

---

## 2. 任务清单

- [ ] 调整 `auditor` preset：permissions 改为 `['audit:read', 'analytics:export']`
- [ ] 新增 `resolveAdminRolePreset(permissions)`：精确匹配 preset 或返回 `custom`
- [ ] 重写 `getDefaultAdminPath`：auditor → `/admin/audit-logs`；有 analytics → dashboard；否则 users/access
- [ ] `adminNavItems` 增加 `admin-users` 项（permission: `rbac:manage`）
- [ ] `DashboardPage`：拆分 `SuperAdminPanel` / `AnalystSummary`；无 analytics 时路由 guard 已有
- [ ] 单测：`admin-access.test.ts` 覆盖三种 preset 的 default path 与 nav 过滤

---

## 3. 验收标准

1. Vitest 通过 preset 路径断言。
2. 手动：三种 demo 账号（或 mock permissions）登录跳转正确。

---

## 4. 依赖

- 无（可先于 API Story 014 实施）
