# Story 018：注册策略收口 + seed 更新

| 属性 | 内容 |
|------|------|
| 状态 | **已完成**（2026-06-01） |
| 所属 Feature | `.ai/features/feature-admin-register-policy.md` |
| 优先级 | P0 |
| 预估 | 0.5 天 |

---

## 1. 目标

默认关闭自助注册；更新 seed 与文档；迁移现有 auditor 权限。

---

## 2. 任务清单

- [ ] 确认 `ADMIN_OPEN_REGISTER` 默认 false（auth.routes / service）
- [ ] `RegisterPage.vue`：检测 403 或 env 提示「请联系超管开通账号」
- [ ] `prisma/seed.ts`：auditor 演示账号 permissions 更新
- [ ] 可选 SQL migration 注释：UPDATE AdminUser SET permissions=...
- [ ] `.env.example` 与 README 片段

---

## 3. 验收标准

1. 未设 env 时注册 API 403。
2. seed 后 auditor 无 analytics:read。

---

## 4. 依赖

- Story 013 preset 定义
