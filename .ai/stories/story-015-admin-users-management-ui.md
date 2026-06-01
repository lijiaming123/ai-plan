# Story 015：管理员账号管理 UI

| 属性 | 内容 |
|------|------|
| 状态 | **已完成**（2026-06-01） |
| 所属 Feature | `.ai/features/feature-admin-account-management.md` |
| 优先级 | P0 |
| 预估 | 1.5 天 |

---

## 1. 目标

web-admin 新增 `/admin/admin-users` 页面，超管可完整治理后台账号。

---

## 2. 任务清单

- [ ] `api-client.ts`：`listAdminAccounts`, `createAdminAccount`, `updateAdminAccount`, `resetAdminPassword`
- [ ] `AdminUsersPage.vue`：表格 + 创建抽屉 + 编辑权限包 + 禁用开关 + 重置密码对话框
- [ ] 路由：`meta.permission = 'rbac:manage'`
- [ ] `AccessControlPage`：超管增加「管理管理员账号」入口按钮
- [ ] 空状态、Toast、二次确认（禁用/重置密码）
- [ ] Vitest：路由 403、按钮可见性（mock permissions）

---

## 3. 验收标准

1. 超管可创建 analyst 并登录验证菜单。
2. 非超管侧栏无「管理员」项，直链 forbidden。

---

## 4. 依赖

- Story 014
