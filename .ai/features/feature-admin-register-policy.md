# Feature：注册策略收口与 seed 更新

| 属性 | 内容 |
|------|------|
| 状态 | **已批准**（2026-06-01） |
| 所属 Epic | `.ai/epics/epic-web-admin-role-governance.md` |
| 优先级 | P0 |
| 目标产出 | 生产关闭自助注册 + auditor preset 迁移 |

---

## 1. 目标

- `ADMIN_OPEN_REGISTER` 默认 `false`；文档与 `.env.example` 说明。
- 注册页：关闭时展示说明 + 隐藏表单或禁用提交。
- 更新 `adminPresetMeta.auditor.permissions` 与 seed 中演示账号。
- 可选 migration SQL：将现有 auditor 权限 JSON 更新为新 preset。

---

## 2. 验收标准

1. 未开启 env 时 register-admin 403。
2. seed 中 admin 仍为全权限；演示 auditor 符合新 preset。
3. PRD 矩阵与 `admin-access.ts` preset 一致。

---

## 3. 关联 Stories

- Story 018：注册策略收口 + seed 更新
