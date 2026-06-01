# web-admin 角色治理与运营闭环 Implementation Plan

> **For agentic workers:** 按 Story 013→018 顺序实施；每 Story 先写测试再实现；完成后更新 Story 状态与 `.ai/progress.md`、`.ai/logs/operation-log.md`。

**Goal:** 将管理端升级为角色驱动的治理控制台——三类岗位有清晰首页/菜单/总览，超管可管 AdminUser，分析导出与审计兑现，审计员以合规工作台为主路径。

**Architecture:** 继续采用「JWT permissions JSON + 路由 preHandler」；前端 `admin-access.ts` 为角色包单一配置源；写操作统一 `writeAuditLog()`；CSV 导出 v1 由前端从已有 analytics JSON 生成并异步记审计。

**Tech Stack:** Fastify + Prisma（apps/api），Vue3 + Pinia + Vitest（apps/web-admin），bcryptjs。

**关联文档:**

- PRD：`.ai/specs/2026-06-01-web-admin-role-governance-prd.md`（已批准）
- Epic：`.ai/epics/epic-web-admin-role-governance.md`

---

## 实施状态（2026-06-01）

- [ ] Phase 0：Story 013 — 角色配置与默认 landing
- [ ] Phase 1：Story 014 — 管理员账号 API
- [ ] Phase 2：Story 015 — 管理员账号管理 UI
- [ ] Phase 3：Story 016 — 分析 CSV 导出 + 审计
- [ ] Phase 4：Story 017 — 审计员工作台 + 审计导出
- [ ] Phase 5：Story 018 — 注册策略收口 + seed 更新
- [ ] Phase 6（P1）：Story 019 — Telemetry 日聚合 UI
- [ ] Phase 7（P1）：Story 020 — 规则编辑 + 审计

---

## File structure / 影响范围（汇总）

**Backend（apps/api）**

| 文件 | 变更 |
|------|------|
| `prisma/schema.prisma` | `AdminUser.disabledAt` |
| `prisma/migrations/*` | 新 migration |
| `prisma/seed.ts` | auditor preset、演示账号 |
| `src/modules/admin/admin-users-admin.service.ts` | **新增** CRUD |
| `src/modules/admin/admin-users-admin.routes.ts` | **新增** 路由 |
| `src/modules/admin/audit-log.service.ts` | **新增** `writeAuditLog` |
| `src/modules/admin/admin.routes.ts` | 可选：规则 PATCH（Story 020） |
| `src/modules/auth/auth.service.ts` | 禁用账号拒绝登录 |
| `src/app.ts` | 注册新 routes |
| `tests/admin-users-admin.test.ts` | **新增** |

**Frontend（apps/web-admin）**

| 文件 | 变更 |
|------|------|
| `src/lib/admin-access.ts` | preset、default path、nav |
| `src/lib/csv-export.ts` | **新增** |
| `src/lib/audit-action-dictionary.ts` | **新增** |
| `src/lib/api-client.ts` | admin-users API、recordAudit |
| `src/features/admin-users/AdminUsersPage.vue` | **新增** |
| `src/features/dashboard/DashboardPage.vue` | 超管/运营模块分化 |
| `src/features/audit/AuditLogsPage.vue` | 摘要 + 导出 |
| `src/features/analytics/*.vue` | 导出按钮 |
| `src/features/auth/RegisterPage.vue` | 关闭态 |
| `src/features/access/AccessControlPage.vue` | 治理入口 |
| `src/router/index.ts` | admin-users 路由 |
| `tests/admin-access.test.ts` | **新增/扩展** |

**Docs / Memory**

- `.ai/stories/story-013` … `story-018`
- `.ai/progress.md`
- `.ai/logs/operation-log.md`

---

## Phase 0 — Story 013：角色配置与默认 landing

**Files:**

- Modify: `apps/web-admin/src/lib/admin-access.ts`
- Modify: `apps/web-admin/src/features/dashboard/DashboardPage.vue`
- Add: `apps/web-admin/tests/admin-access.test.ts`

### Step 1：写失败测试 — preset 与 default path

```ts
import { describe, expect, it } from 'vitest';
import { getDefaultAdminPath, adminPresetMeta } from '../src/lib/admin-access';

describe('admin role landing', () => {
  it('auditor preset has no analytics:read', () => {
    const auditor = adminPresetMeta.find((p) => p.key === 'auditor')!;
    expect(auditor.permissions).not.toContain('analytics:read');
    expect(auditor.permissions).toContain('audit:read');
  });

  it('auditor lands on audit-logs', () => {
    const perms = ['audit:read', 'analytics:export'];
    expect(getDefaultAdminPath(perms)).toBe('/admin/audit-logs');
  });

  it('analyst lands on dashboard', () => {
    expect(getDefaultAdminPath(['analytics:read', 'users:read', 'analytics:export'])).toBe('/admin/dashboard');
  });
});
```

- [ ] **Step 1:** 添加上述测试
- [ ] **Step 2:** `pnpm --filter @ai-plan/web-admin test` → 预期 FAIL
- [ ] **Step 3:** 修改 `adminPresetMeta.auditor.permissions`
- [ ] **Step 4:** 实现 `getDefaultAdminPath` 新逻辑
- [ ] **Step 5:** 测试 PASS
- [ ] **Step 6:** 分化 `DashboardPage`（`rbac:manage` 块保留；analyst 块：漏斗/留存 KPI 摘要；移除 auditor 无关 copy）
- [ ] **Step 7:** 更新 Story 013 状态 → 已完成

---

## Phase 1 — Story 014：管理员账号 API

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Add: migration
- Add: `apps/api/src/modules/admin/admin-users-admin.service.ts`
- Add: `apps/api/src/modules/admin/admin-users-admin.routes.ts`
- Add: `apps/api/src/modules/admin/audit-log.service.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/src/app.ts`
- Add: `apps/api/tests/admin-users-admin.test.ts`

### Step 1：Schema

```prisma
model AdminUser {
  // ...existing
  disabledAt DateTime?
}
```

- [ ] **Step 1:** migration + `prisma generate`
- [ ] **Step 2:** 实现 `writeAuditLog({ actor, action, targetType, targetId, summary, meta, request })`
- [ ] **Step 3:** 写失败测试 — GET list 403 without rbac:manage
- [ ] **Step 4:** 实现 list/create/patch/reset-password
- [ ] **Step 5:** 测试 — 禁止 self-disable
- [ ] **Step 6:** 登录拒绝 disabled 用户
- [ ] **Step 7:** 全量 API test PASS

**create body 示例:**

```json
{
  "loginId": "ops1",
  "email": "ops1@example.com",
  "password": "TempPass123!",
  "presetKey": "analyst"
}
```

---

## Phase 2 — Story 015：管理员账号管理 UI

- [ ] **Step 1:** `api-client` 方法 + 类型
- [ ] **Step 2:** `AdminUsersPage.vue` 列表与表单
- [ ] **Step 3:** 路由 + nav（permission: rbac:manage）
- [ ] **Step 4:** Access 页入口链接
- [ ] **Step 5:** Vitest 路由守卫
- [ ] **Step 6:** 手动：超管创建 analyst → 新窗口登录验证

---

## Phase 3 — Story 016：分析 CSV 导出 + 审计

- [ ] **Step 1:** `csv-export.ts` 单测
- [ ] **Step 2:** 后端 `POST /admin/audit-events`（仅 admin JWT，body: action/summary/meta）或 internal service 供前端调用的轻量 endpoint
- [ ] **Step 3:** 三分析页加 ExportButton 组件（props: filename, rows, disabledReason）
- [ ] **Step 4:** 导出成功 → 调 audit record
- [ ] **Step 5:** 单测 + 手动下载验证 Excel 中文

---

## Phase 4 — Story 017：审计员工作台

- [ ] **Step 1:** `audit-action-dictionary.ts`
- [ ] **Step 2:** AuditLogsPage 摘要区（基于当前 items 或额外 count API — v1 可 client-side）
- [ ] **Step 3:** 高风险快捷筛选
- [ ] **Step 4:** 审计 CSV 导出 + audit.export
- [ ] **Step 5:** auditor 账号登录冒烟

---

## Phase 5 — Story 018：注册策略 + seed

- [ ] **Step 1:** 确认 register 默认 403
- [ ] **Step 2:** RegisterPage UI
- [ ] **Step 3:** seed auditor 更新
- [ ] **Step 4:** 文档 `.env.example`

---

## Phase 6（P1）— Story 019：Telemetry 日聚合 UI

- [ ] 超管/运营 Dashboard 或独立 `/admin/telemetry`：日期 picker + 调用 `POST /admin/telemetry/aggregate-day?day=`
- [ ] 展示上次结果 message / counts

---

## Phase 7（P1）— Story 020：规则编辑

- [ ] `PATCH /admin/rules/:key` body `{ value, enabled? }` — require `rbac:manage` 或 `analytics:read`+写权限待定（建议 rbac:manage）
- [ ] RulesPage 编辑态 + 审计 `rules.update`
- [ ] API 单测

---

## 测试命令

```powershell
# API
cd d:\myproject\ai-plan
corepack pnpm --filter @ai-plan/api test

# web-admin
corepack pnpm --filter @ai-plan/web-admin test
corepack pnpm --filter @ai-plan/web-admin build
```

---

## 执行顺序与确认节点

| 节点 | 内容 | 需用户确认 |
|------|------|------------|
| N0 | 本计划文档 + PRD 已批准 | ✓ 已完成 |
| N1 | Story 013 完成 | 可选 |
| N2 | Story 014–015 完成（治理闭环） | **建议确认** |
| N3 | Story 016–018 完成（P0 全集） | **建议确认** |
| N4 | P1 Story 019–020 | 用户批准后执行 |

---

## 回滚策略

- migration 仅增 `disabledAt`，可空，回滚安全。
- preset 变更仅影响新登录路由；旧 token 仍含旧 permissions 直至重新登录。
- 保留 seed `admin` 全权限，避免锁死。

---

## 审批记录

| 日期 | 操作 |
|------|------|
| 2026-06-01 | 用户批准 PRD 与计划编写 |
