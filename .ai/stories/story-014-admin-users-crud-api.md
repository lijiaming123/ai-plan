# Story 014：管理员账号 API

| 属性 | 内容 |
|------|------|
| 状态 | **待办** |
| 所属 Feature | `.ai/features/feature-admin-account-management.md` |
| 优先级 | P0 |
| 预估 | 1.5 天 |

---

## 1. 目标

实现 `AdminUser` 治理 REST API，全部需 `rbac:manage`，写操作写审计。

---

## 2. API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/admin-users` | 列表（loginId, email, permissions, disabledAt, createdAt） |
| POST | `/admin/admin-users` | 创建 `{ loginId, email?, password, presetKey \| permissions[] }` |
| PATCH | `/admin/admin-users/:id` | 更新 preset/permissions、email；`disabled: boolean` |
| POST | `/admin/admin-users/:id/reset-password` | `{ newPassword }` |

---

## 3. 任务清单

- [ ] Prisma：`AdminUser` 增加 `disabledAt DateTime?` + migration
- [ ] `admin-users-admin.service.ts`：CRUD + 校验（禁止自禁用）
- [ ] `admin-users-admin.routes.ts`：注册路由
- [ ] 登录 `auth.service`：若 `disabledAt != null` 拒绝
- [ ] `writeAuditLog` 封装（若尚无则新增）并在各写操作调用
- [ ] 单测：403、创建、禁用、自禁用拒绝、审计行存在

---

## 4. 验收标准

1. API Vitest 全通过。
2. OpenAPI/注释与 PRD 一致。

---

## 5. 依赖

- Story 013（preset 定义稳定）
