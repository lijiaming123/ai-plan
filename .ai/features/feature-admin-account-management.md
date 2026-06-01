# Feature：管理员账号治理

| 属性 | 内容 |
|------|------|
| 状态 | **已批准**（2026-06-01） |
| 所属 Epic | `.ai/epics/epic-web-admin-role-governance.md` |
| 优先级 | P0 |
| 目标产出 | 超管 UI + API 管理 AdminUser |

---

## 1. 目标

- API：`GET/POST/PATCH /admin/admin-users`，`POST .../reset-password`，需 `rbac:manage`。
- UI：管理员列表、创建、改角色包、禁用/启用、重置密码。
- 安全：禁止禁用当前登录超管；至少保留一名超管。

---

## 2. 验收标准

1. 无 `rbac:manage` → 403。
2. 创建账号 bcrypt 存库，permissions 来自 preset 或自定义勾选。
3. 每次写操作写 AuditLog（action：`rbac.admin.create|update|disable|enable|reset_password`）。
4. web-admin 新页 `/admin/admin-users`，侧栏仅超管可见。

---

## 3. 关联 Stories

- Story 014：管理员账号 API
- Story 015：管理员账号管理 UI
