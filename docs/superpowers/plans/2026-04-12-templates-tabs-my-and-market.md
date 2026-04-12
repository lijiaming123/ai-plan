# 模板页 Tab：「我的模板」与「模板市场」Implementation Plan

> **Skill:** executing-plans（先审后做）；UI 遵循 frontend-design：在现有 PlanMaster 有机雾绿基调上强化 Tab、磨砂筛选条与卡片层次，避免泛化「AI 审美」。

**Goal:** 模板页顶部主 Tab：**我的模板** | **模板市场**。  
- **我的模板**（需登录）：子分区 **我创建的** / **我收藏的** / **我点赞的**（均指向市场模板记录，不含系统预设）。未登录时展示引导登录。  
- **模板市场**：**系统预设** + **用户模板**（原社区列表）；用户模板区保留搜索、分类、标签、排序与套用/点赞；登录时对卡片展示 **收藏** 状态（依赖可选鉴权或批量标记）。

**Architecture:** Prisma 新增 `MarketTemplateFavorite`（`userId`+`templateId` 唯一）。API：`GET /templates/my/market?scope=created|favorited|liked` + 与 `marketListQuerySchema` 一致的筛选分页；`POST/DELETE /templates/market/:id/favorite`。`GET /templates/market` 在带合法 Bearer 时返回每条 `favorited` / `likedByMe` 布尔字段。

**Out of scope（后续可补）:** 收藏数公开展示、系统预设的「收藏」、消息通知。

---

## Tasks

### Task 1: Shared Zod

- [x] `myMarketListQuerySchema` = `marketListQuerySchema` + `scope` 枚举
- [x] 导出 + `packages/shared` 测试
- [x] `pnpm --filter @ai-plan/shared test`

### Task 2: Prisma 与迁移

- [x] `MarketTemplateFavorite` 模型 + `MarketTemplate.favorites`
- [x] 迁移 SQL + `prisma generate`

### Task 3: API

- [x] `listMyMarketTemplates`（三 scope + 筛选排序分页）
- [x] `favoriteMarketTemplate` / `unfavoriteMarketTemplate`
- [x] `listMarketTemplates` 支持可选 `userId`  enrich `favorited` / `likedByMe`
- [x] 路由：`GET /templates/my/market`、`favorite` POST/DELETE；`GET /templates/market` 可选 JWT
- [x] 测试：`template-my-market.test.ts` 或扩展现有 market 测试

### Task 4: Web

- [x] `api-client`：类型与 `listMyMarketTemplates`、`favoriteMarketTemplate`、`unfavoriteMarketTemplate`；`listMarketTemplates` 解析新字段
- [x] `TemplatesPage.vue`：主 Tab + 我的模板子 Tab + 模板市场双区块 UI（frontend-design）
- [x] `TemplateMarketList.vue`：收藏按钮、`likedByMe` 时点赞可改为取消赞（或双按钮简化：仅市场 Tab 展示收藏）
- [x] 更新 `tests/template-market.test.ts`

### Task 5: 验证

- [x] `pnpm --filter @ai-plan/api test`、`pnpm --filter @ai-plan/web-user test`

---

**状态：** 已完成。
