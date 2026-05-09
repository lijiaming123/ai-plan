# 架构设计：web-user「模板市场（公开 UGC）」商用落地（Templates Domain）

| 属性 | 内容 |
|------|------|
| 状态 | **草稿**（2026-05-09） |
| 关联 PRD | `.ai/specs/2026-05-09-web-user-template-market-ugc-prd.md`（待审批） |
| 记忆目录 | `ai-plan/.ai/` |

> 说明：仓库内未找到 `template-arch.md`，本文沿用现有 `.ai/specs/*-arch.md` 的结构与 Mermaid 表达方式。

---

## 1. 架构目标

在现有 `apps/web-user` + `apps/api` 的模板市场能力基础上，补齐公开 UGC 商用所需的**治理闭环**：

1. **状态机与生命周期**：发布→待审→通过/驳回→下架/封禁，并确保公开端只展示可控状态。
2. **审核与审计**：审核队列、审核记录；关键操作审计可查询、可追溯。
3. **举报与处置**：举报表、处理流转、处置动作（下架/封禁）均可审计。
4. **版本化与复现**：模板 payload 快照版本；apply 绑定版本，确保可复现与回溯。
5. **反滥用**：接口幂等 + 基础频控 + 异常阈值观测。

---

## 2. 系统层次结构（现有 + 新增）

```mermaid
flowchart TB
  subgraph webUser["apps/web-user（展示/发布/交互）"]
    TPL[TemplatesPage<br/>market+mine]
    PUB[PlanDetailPage<br/>publish form]
    DTL[TemplateDetailPage<br/>preview (M2)]
  end

  subgraph api["apps/api（模板域）"]
    RTE[template.routes]
    SVC[market-template.service<br/>preset-template.service]
    REV[review service (new)]
    REP[report service (new)]
    AUD[audit log service (existing)]
    RL[rate limit / anti-abuse (v1)]
    DB[(Postgres/Prisma)]
  end

  webUser -->|GET/POST /templates/*| RTE --> SVC --> DB
  SVC -->|write audit events| AUD --> DB
  RTE --> REV --> DB
  RTE --> REP --> DB
  RTE --> RL
  webUser -->|admin UI later| REV
```

---

## 3. 组件与职责

| 组件 | 职责 |
|------|------|
| `TemplatesPage.vue` | 市场/我的模板列表、筛选、排序、分页；点赞/收藏/套用 |
| `PlanDetailPage.vue` | 从计划发布模板（提交 title/summary/category/tags + planId） |
| `template.routes.ts` | 模板域 HTTP 路由；匿名可读市场列表；用户态写操作鉴权 |
| `market-template.service.ts` | 市场模板查询、发布、点赞/收藏、套用；（将扩展状态机/版本） |
| `preset-template.service.ts` | 运营预设模板列表与套用 |
| `review service`（新增） | 审核队列、approve/reject、审核记录、处置动作 |
| `report service`（新增） | 举报写入、举报列表、关联处置 |
| `audit-log.service.ts`（既有） | 关键操作审计写入与查询（复用） |
| `rate limit`（新增/复用） | 发布/点赞/收藏/套用/举报的基础频控 + 幂等策略 |

---

## 4. 数据模型（概念草案）

> 以 Prisma/Postgres 为基准；字段命名以现有项目约定为准，以下是“概念模型”。\n

### 4.1 MarketTemplate（主记录）

- `id`
- `authorId`
- `sourcePlanId`（可空，来源 plan 快照）
- `title/summary/category/tags`
- `status`：`pending_review | published | rejected | unpublished | banned | ...`
- `publishedAt` / `unpublishedAt` / `bannedAt`
- `likeCount` / `applicationCount`
- `currentPublishedVersionId`（可空，未发布时为空）

### 4.2 MarketTemplateVersion（快照版本）

- `id`
- `templateId`
- `version`（int，自增或基于 createdAt 排序）
- `payload`（jsonb）
- `hash`（用于幂等/去重）
- `createdAt` / `createdByUserId`
- `state`（可选：pending/published/archived，与审核/发布策略绑定）

### 4.3 TemplateReviewLog（审核记录）

- `id`
- `templateId` / `versionId`
- `reviewerId`
- `decision`：approve/reject
- `reasonCode`（枚举）
- `note`（可选）
- `createdAt`

### 4.4 TemplateReport（举报）

- `id`
- `templateId`
- `reporterId`（可空：匿名举报是否允许，待决策）
- `reasonCode`
- `description`
- `evidence`（可选）
- `status`：open/triaged/resolved
- `createdAt` / `resolvedAt`

> 审计日志：复用现有 `AuditLog` 表/服务（若已有），写入 `template_publish/template_review/template_unpublish/template_ban/template_apply/...` 事件。

---

## 5. API 设计（扩展草案）

### 5.1 现有接口（已存在）

- `GET /templates/presets`
- `POST /templates/presets/:id/apply`
- `GET /templates/market`
- `GET /templates/my/market`
- `POST /templates/market`
- `POST/DELETE /templates/market/:id/like`
- `POST/DELETE /templates/market/:id/favorite`
- `POST /templates/market/:id/apply`

### 5.2 新增接口（P0）

- 作者侧：\n
  - `PATCH /templates/market/:id`（仅允许修改元信息；触发重新审核）\n
  - `POST /templates/market/:id/unpublish`（作者下架）\n
  - `GET /templates/my/market?scope=created&includeStatus=1`（返回状态与审核信息摘要）\n
- 举报：\n
  - `POST /templates/market/:id/report`\n
- 管理侧（后续可挂到 `apps/web-admin`，但先提供 API）：\n
  - `GET /admin/templates/review-queue`\n
  - `POST /admin/templates/:id/approve`\n
  - `POST /admin/templates/:id/reject`\n
  - `GET /admin/templates/reports`\n
  - `POST /admin/templates/:id/moderate`（unpublish/ban/unban 等）\n

---

## 6. 安全、合规与风控

- **鉴权**：\n
  - 公开市场 `GET /templates/market` 支持匿名；若带 Bearer 仅用于 viewer flags（已存在 optionalViewerUserId）。\n
  - 写操作必须 `requireRole('user')`；管理操作必须 `requirePermission('templates:review'/'templates:moderate')`。\n
- **频控**：\n
  - 发布、点赞、收藏、套用、举报各自独立限流；并对重复 like/favorite 做幂等（现有逻辑已基本幂等）。\n
- **payload 安全**：\n
  - 继续使用 `parseTemplatePayload` 白名单字段校验；对外展示的预览不直接返回完整 payload（避免泄露）。\n

---

## 7. 性能与可扩展

- **查询**：市场列表按 `publishedAt/likeCount` 排序；索引建议：`(status, publishedAt)`, `(status, likeCount)`，并对 tags array 评估 GIN。\n
- **版本表增长**：版本快照按 templateId 分区查询；必要时归档旧版本。\n
- **可观测**：模板域事件与审计统一口径，后续可接入 Analytics 漏斗（发布→通过→曝光→套用）。\n

---

## 8. 测试策略

| 层级 | 内容 |
|------|------|
| API | 状态机/权限/审核/举报/处置/频控单测；apply 与版本绑定回归 |
| Web-user | 发布入口、我的模板状态展示、下架/编辑交互、异常态渲染 |
| 兼容 | 现有 `TemplateMarketList` 与 `TemplatesPage` 测试必须保持通过（`apps/web-user/tests/template-market.test.ts`） |

---

## 9. 待决策与风险

- 审核策略（全量 vs 风控命中）与直发白名单\n
- 编辑上线策略（隐藏旧版 vs 继续展示旧版）\n
- 举报是否允许匿名、证据存储策略\n
- 频控阈值与异常检测指标口径\n

---

## 10. 审批

- 审批人：用户  \n
- 结论：**待审批**  \n
- 日期：2026-05-09  \n

