# 模板系统（预设 + 用户市场）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付「系统预设模板 + 用户模板市场」：用户可将计划发布为模板供他人搜索筛选、按点赞排序、一键点赞与套用生成新计划。

**Architecture:** 后端用 Prisma 区分 **PresetTemplate**（系统内置、只读、可版本化）与 **MarketTemplate**（用户发布、带作者、点赞聚合）。市场列表走分页查询（关键词 ILIKE、分类/标签过滤、`sort=likes|new`）。套用模板复用现有「创建计划」管线（将模板快照映射为 `CreatePlanInput` / 草稿助手入参）。前端扩展 `TemplatesPage` 为市场 UI，并在计划详情或创建流增加「发布为模板」入口。

**Tech Stack:** Vue 3 + TypeScript + Vitest；Fastify + Prisma + PostgreSQL + Zod；与现有 `@ai-plan/shared` 契约对齐。

---

## 产品范围与分阶段（建议）

| 阶段 | 内容 | 验收要点 |
|------|------|----------|
| **MVP-1** | 预设模板库 + 套用 | 未登录可读列表；登录可套用生成草稿/计划 |
| **MVP-2** | 用户发布 + 点赞 + 市场检索排序 | 发布、点赞幂等、市场搜索与按赞排序 |
| **MVP-3（可选）** | 审核、举报、创作者中心 | 后台或简单审核队列；违规下架 |

本计划任务按 **MVP-1 → MVP-2** 编排；MVP-3 以独立 Epic 附录列出，不阻塞前两段交付。

---

## 核心概念

### 预设模板（系统）

- 由运维/发布流程写入数据库或 migration seed，**普通用户不可改**。
- 字段建议：`slug`（唯一）、`title`、`summary`、`coverImageUrl?`、`category`（枚举或字符串）、`tags[]`、`locale`（默认 `zh-CN`）、`payload`（JSON：与创建计划表单 / `CreatePlanInput.profile` 对齐的结构化默认值）、`sortOrder`、`isActive`。
- **不包含**点赞实体（可选：仅展示「系统推荐」角标）。

### 用户模板（市场）

- 作者 `userId`，从**已有计划**导出快照或从「空白模板」表单创建。
- 状态：`draft` → `published`（MVP 可直接 published；若上审核则为 `pending` → `published|rejected`）。
- **点赞**：`MarketTemplateLike(userId, templateId)` 唯一约束；提供 toggle 或 POST+DELETE。
- **应用次数**（可选）：`applicationCount` 冗余字段 + 事务递增，或仅依赖分析表；MVP 建议冗余计数便于排序扩展（`hot`）。

### 市场交互

- **搜索**：标题、摘要、标签全文检索（PostgreSQL `ILIKE` 或后续 `tsvector`）。
- **筛选**：分类、标签（多选 AND/OR 策略需在 API 层写清，建议 MVP：标签 OR、分类单选）。
- **排序**：`likes`（降序）、`new`（`publishedAt` 降序）；并列时二级键 `id`。

---

## File Structure Map（预期）

**Shared**

- Create: `packages/shared/src/template-schemas.ts`（Zod：列表查询、发布 body、套用结果）
- Modify: `packages/shared/src/index.ts`（导出）
- Test: `packages/shared/tests/template-schemas.test.ts`

**API**

- Create: `apps/api/prisma/migrations/*_template_system.sql`（或通过 `prisma migrate`）
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/modules/templates/preset-template.service.ts`
- Create: `apps/api/src/modules/templates/market-template.service.ts`
- Create: `apps/api/src/modules/templates/template.routes.ts`
- Modify: `apps/api/src/app.ts`（注册路由）
- Test: `apps/api/tests/template-preset.test.ts`
- Test: `apps/api/tests/template-market.test.ts`

**Web User**

- Modify: `apps/web-user/src/lib/api-client.ts`（模板相关方法）
- Modify: `apps/web-user/src/features/templates/TemplatesPage.vue`（市场 UI）
- Create: `apps/web-user/src/features/templates/TemplateMarketList.vue`（可拆分）
- Create: `apps/web-user/src/features/templates/TemplateDetailDrawer.vue`（可选）
- Modify: `apps/web-user/src/features/plans/PlanDetailPage.vue` 或 `PlanCreatePage.vue`（「发布为模板」入口）
- Test: `apps/web-user/tests/template-market.test.ts`

**Seed / Ops**

- Create: `apps/api/prisma/seeds/preset-templates.json`（或 TS seed）
- Modify: `docs/ops/runbook.md`（如何重跑 seed）

---

## 数据模型草案（Prisma 示意）

> 实现时以最终 `schema.prisma` 为准；下列为字段意图说明。

```prisma
model PresetTemplate {
  id          String   @id @default(cuid())
  slug        String   @unique
  title       String
  summary     String
  category    String
  tags        String[] // 或 Json，按项目惯例
  locale      String   @default("zh-CN")
  payload     Json     // 套用时的默认参数快照
  sortOrder   Int      @default(0)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model MarketTemplate {
  id               String   @id @default(cuid())
  authorId         String
  sourcePlanId     String?  // 从哪份计划发布（审计用）
  title            String
  summary          String
  category         String
  tags             String[]
  payload          Json
  status           String   @default("published") // draft | pending | published | rejected
  publishedAt      DateTime?
  likeCount        Int      @default(0)           // 冗余，点赞时事务维护
  applicationCount Int      @default(0)           // 可选
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  author           User     @relation(fields: [authorId], references: [id])
  likes            MarketTemplateLike[]
  @@index([status, publishedAt])
  @@index([category])
}

model MarketTemplateLike {
  id         String   @id @default(cuid())
  userId     String
  templateId String
  createdAt  DateTime @default(now())
  user       User     @relation(fields: [userId], references: [id])
  template   MarketTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  @@unique([userId, templateId])
  @@index([templateId])
}
```

**注意：** 若当前 `User` 模型名或主键与上不同，按现有 `schema.prisma` 调整 relation。

---

## API 草案

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/templates/presets` | 活跃预设列表（可选 `category`） |
| `GET` | `/templates/market` | 分页：`q`, `category`, `tag`, `sort=likes|new`, `cursor`/`page` |
| `GET` | `/templates/market/:id` | 详情（脱敏：不暴露作者邮箱明文可选） |
| `POST` | `/templates/market` | 发布（需登录）：body 含 `planId` 或显式 `payload` |
| `POST` | `/templates/market/:id/like` | 点赞（需登录，幂等） |
| `DELETE` | `/templates/market/:id/like` | 取消赞（与 POST 二选一即可） |
| `POST` | `/templates/market/:id/apply` | 套用（需登录）：返回 `{ planId }` 或跳转草稿所需 id |

**授权：** 市场列表只展示 `status=published`；作者可 `GET` 自己的 `draft`。

**限流：** 点赞与发布建议加 rate limit（复用现有 Fastify 插件若已有）。

---

### Task 1: 共享契约与失败测试（Zod）

**Files:**

- Create: `packages/shared/src/template-schemas.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/tests/template-schemas.test.ts`

- [x] **Step 1：** 定义 `marketListQuerySchema`（`q`、`category`、`tag`、`sort` 枚举、`page`/`pageSize` 上限）
- [x] **Step 2：** 定义 `publishMarketTemplateSchema`（`planId` 与 `payload` 互斥或优先级规则写清）
- [x] **Step 3：** 编写校验测试（非法 `sort`、超大 `pageSize` 应失败）
- [x] **Step 4：** `pnpm --filter @ai-plan/shared test` 通过

---

### Task 2: Prisma 模型与迁移

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/...`

- [x] **Step 1：** 加入 `PresetTemplate`、`MarketTemplate`、`MarketTemplateLike`（及与 `User` 关系）
- [x] **Step 2：** `pnpm --filter @ai-plan/api exec prisma migrate dev` 生成迁移
- [x] **Step 3：** 本地空库与健康 API 启动验证无报错

---

### Task 3: 预设模板 Seed（不少于 3 套）

**Files:**

- Create: `apps/api/prisma/seeds/preset-templates.json`（或同级 TS）
- Modify: `package.json` / `prisma/seed.ts`（若项目已有 seed 入口则扩展）

- [x] **Step 1：** 至少 3 个场景：学习备考、健身、工作项目（`payload` 与现有创建计划 profile 字段兼容）
- [x] **Step 2：** 执行 seed 后 `GET /templates/presets` 可返回数据（接口在 Task 4 实现后可测）

---

### Task 4: API — 预设列表与套用（MVP-1）

**Files:**

- Create: `apps/api/src/modules/templates/preset-template.service.ts`
- Create: `apps/api/src/modules/templates/template.routes.ts`（可先只挂 preset）
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/tests/template-preset.test.ts`

- [x] **Step 1：** 实现 `listPresets`（仅 `isActive=true`，按 `sortOrder`）
- [x] **Step 2：** 实现 `applyPreset`：组装 `CreatePlanInput` 调用现有 `createPlan` 服务（禁止重复造轮子）
- [x] **Step 3：** 编写注入测试：未授权套用应 401；授权后返回新 `planId`
- [x] **Step 4：** `pnpm --filter @ai-plan/api test` 相关用例通过

---

### Task 5: API — 市场 CRUD、点赞、列表查询（MVP-2）

**Files:**

- Create: `apps/api/src/modules/templates/market-template.service.ts`
- Modify: `apps/api/src/modules/templates/template.routes.ts`
- Test: `apps/api/tests/template-market.test.ts`

- [x] **Step 1：** `POST /templates/market` 从 `planId` 读取快照写入 `MarketTemplate`（校验 plan 属于当前用户且状态允许导出）
- [x] **Step 2：** `GET /templates/market` 支持 `q`、`category`、`sort=likes|new`、分页
- [x] **Step 3：** 点赞接口：`likeCount` 与 `MarketTemplateLike` 同事务更新；重复点赞不重复计数
- [x] **Step 4：** `POST .../apply` 与预设套用共享同一套「payload → 创建计划」映射函数
- [x] **Step 5：** 注入测试覆盖：排序、搜索、点赞幂等、套用

---

### Task 6: Web User — 模板市场页

**Files:**

- Modify: `apps/web-user/src/lib/api-client.ts`
- Modify: `apps/web-user/src/features/templates/TemplatesPage.vue`
- Create: `apps/web-user/src/features/templates/*`（按拆分需要）
- Test: `apps/web-user/tests/template-market.test.ts`

- [x] **Step 1：** API client 方法：`listPresets`、`listMarket`、`like`、`apply`
- [x] **Step 2：** 市场页：搜索框、分类/标签筛选 UI、`sort` 切换（点赞 / 最新）
- [x] **Step 3：** 卡片：展示赞数、作者昵称（若有）、「套用」「点赞」按钮（未登录引导登录）
- [x] **Step 4：** Vitest + mock client 覆盖列表与排序切换（路由 query 同步可选）

---

### Task 7: Web User — 从计划发布模板

**Files:**

- Modify: `apps/web-user/src/features/plans/PlanDetailPage.vue`（或创建成功后的详情）
- （可选）Modal 组件

- [x] **Step 1：** 「发布为模板」按钮（仅计划所有者、状态满足时显示）
- [x] **Step 2：** 简单表单：标题、摘要、分类、标签（预填自计划 goal/requirement）
- [x] **Step 3：** 成功后跳转模板页并 toast

---

### Task 8: 文档与 E2E（可选）

**Files:**

- Modify: `docs/ops/runbook.md`
- Create: `tests/e2e/template-market.spec.ts`（若已有 Playwright）

- [x] **Step 1：** Runbook：seed、环境变量、常见问题（迁移失败等）
- [x] **Step 2：** E2E：登录 → 市场 → 套用 → 出现新计划（时间允许再做）

---

## 附录 A：MVP-3（审核与治理）— 不纳入本计划必选任务

- `MarketTemplate.status=pending` 与管理员审核接口（`web-admin`）
- 举报、下架、作者申诉
- 敏感词过滤与异步任务

---

## 附录 B：与「生成计划」对齐说明

- 模板 `payload` 必须版本化思路：当 `CreatePlanInput` 演进时，预设数据用 migration 升级或 `payloadVersion` 字段 + 适配器函数转换。
- AI 助手模式：套用模板＝预填 `PlanCreatePage` 表单或直调后端创建（产品决策二选一，建议在 Task 4 前在 PRD 一行话定稿）。

---

## 风险与开放问题（实现前建议拍板）

1. **套用后进入哪一步：** 直接进入「创建页预填」还是后台静默创建再进草稿？影响 UX 与 API 返回结构。
2. **点赞是否允许重复点：** 采用 toggle（推荐）或仅累加（需防刷）。
3. **标签体系：** 自由文本 vs 受控词表（受控更利于筛选一致性）。
4. **多语言：** 预设 `locale` 是否与用户语言联动。

---

**计划状态：** 待你确认后可按 `executing-plans` 从 Task 1 逐项执行；若需调整范围（例如先做 MVP-1 冻结），请在本文件顶部追加「修订记录」段落并勾选范围。
