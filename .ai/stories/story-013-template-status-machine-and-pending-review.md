# Story 013：模板状态机落地 + 发布默认待审 + 公开列表只出 published

| 属性 | 内容 |
|------|------|
| 状态 | **待审批**（2026-05-09） |
| 所属 Feature | `.ai/features/feature-template-governance-lifecycle.md` |
| 优先级 | P0 |
| 预估 | 2–4 天 |

---

## 1. 目标

- MarketTemplate 引入状态机字段（至少覆盖 P0 状态）\n
- `POST /templates/market`：创建模板时默认 `pending_review`\n
- `GET /templates/market` 与 `GET /templates/market/:id`：只展示 `published`\n
- `apply/like/favorite` 对非 `published` 返回 404（或业务错误，保持对外不可见）\n

---

## 2. 验收标准

1. 用户发布模板后，公开市场列表不可见；作者侧可见（通过“我的模板 created”）。\n
2. 审核未通过/下架/封禁状态的模板对外不可见，且不可套用/点赞/收藏。\n
3. 公开列表的排序与筛选仍可用，且兼容匿名访问。\n

---

## 3. 测试策略

- API 单测：\n
  - publish 后状态为 pending_review\n
  - listMarketTemplates 只返回 published\n
  - 非 published 的 apply/like/favorite 返回 404/400\n
- web-user 回归：现有 `apps/web-user/tests/template-market.test.ts` 不得回归\n

---

## 4. 依赖

- Prisma schema 迁移能力\n
- 现有模板域路由与 service（`template.routes.ts` / `market-template.service.ts`）\n

