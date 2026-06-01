# 里程碑与交付范围：模板市场（公开 UGC）商用化（M0–M3）

| 属性 | 内容 |
|------|------|
| 状态 | **草稿**（2026-05-09） |
| 关联 PRD | `.ai/specs/2026-05-09-web-user-template-market-ugc-prd.md` |
| 关联架构 | `.ai/specs/2026-05-09-web-user-template-market-ugc-arch.md` |
| 记忆目录 | `ai-plan/.ai/` |

---

## 1. 里程碑总览

| 里程碑 | 目标 | 关键交付物 | 预计周期 |
|--------|------|------------|----------|
| **M0 可控发布** | 发布不再“即上线”，最小可商用治理闭环 | 状态机 + 作者侧管理 + 基础频控 + 审计接入 | 1–3 天 |
| **M1 审核/举报闭环** | 审核队列与举报处置可用 | admin API + 审核记录 + 举报 API + 处置动作 | 3–7 天 |
| **M2 详情/预览/版本化** | 提升转化与可追溯 | 详情页 + 结构化预览 + 版本快照 + apply 绑定版本 | 1–2 周 |
| **M3 运营与增长** | 可运营、可增长、可规模化 | 推荐位/精选/排序/反作弊 + 指标看板 | 持续迭代 |

---

## 2. M0：最小“可控发布”（P0）

### 2.1 Scope（必须做）

- **API/数据**\n
  - MarketTemplate 增加 `status`（至少：`pending_review/published/rejected/unpublished/banned`）\n
  - `POST /templates/market`：写入 `pending_review`（或按策略直发）\n
  - 作者侧：\n
    - `POST /templates/market/:id/unpublish`\n
    - `PATCH /templates/market/:id`（仅元信息，触发重新审核）\n
  - 基础频控：发布/点赞/收藏/套用/举报\n
  - 审计接入：publish/edit/unpublish/apply/like/favorite\n

- **web-user**\n
  - “我的模板(created)”能看到状态（至少待审/已发布/驳回/已下架）\n
  - 发布入口展示发布须知/协议勾选（仅前端，后端可后置）\n

### 2.2 Out（不做）

- 完整审核台 UI（只做 API 或临时脚本）\n

### 2.3 验收（抽样）

- 发布后不进入公开市场；作者可见“待审核”\n
- 下架后公开市场不可见且不可套用\n

---

## 3. M1：审核台 + 举报/处置闭环（P0→P1）

### 3.1 Scope（必须做）

- **审核 API（admin）**\n
  - `GET /admin/templates/review-queue`（分页、按状态/时间）\n
  - `POST /admin/templates/:id/approve`\n
  - `POST /admin/templates/:id/reject`（reasonCode + note）\n
  - 审核记录：TemplateReviewLog（或复用审计但建议独立表，便于查询与统计）\n

- **举报 API**\n
  - `POST /templates/market/:id/report`（reasonCode、描述、证据可选）\n
  - 管理端：`GET /admin/templates/reports` + 处置（unpublish/ban）\n

### 3.2 兼容策略

- 公开市场查询只展示 `published`\n
- “我的模板”接口需支持返回非 published（created scope）\n

---

## 4. M2：详情页/预览 + 版本化（P1）

### 4.1 Scope（必须做）

- **版本化**\n
  - 引入 `MarketTemplateVersion` 保存 payload 快照\n
  - publish/update 生成新版本；`MarketTemplate.currentPublishedVersionId` 指向对外可见版本\n
  - apply 绑定 versionId（审计/统计）\n

- **模板详情页**\n
  - web-user 路由：`/templates/market/:id`\n
  - API：详情返回结构化字段（不直接返回完整 payload，或对 payload 做裁剪）\n
  - 预览：目标/期限/摘要/粒度等可读信息\n

### 4.2 兼容策略

- 旧模板（无 versionId）迁移策略：\n
  - 后台脚本为历史 published 模板补一条 v1 快照并回填 currentPublishedVersionId\n

---

## 5. M3：运营与增长（持续）

- 推荐位/精选/置顶、官方模板体系\n
- 排序：热度 = like + apply + 时间衰减 + 质量分（反作弊）\n
- 搜索：分词/同义词/权重\n
- 指标：发布→通过→曝光→套用漏斗；举报率、驳回率、下架率\n

---

## 6. 数据模型与接口演进原则（兼容性）

1. **对外只暴露 published**：公开市场与详情仅对外展示可控状态。\n
2. **新增字段可选**：对 web-user 先用可选字段承接（避免强依赖后端一次性大改）。\n
3. **版本绑定不可回退**：一旦 apply 绑定 versionId，审计与统计口径以 versionId 为准。\n
4. **原因码枚举化**：审核/举报 reasonCode 优先枚举，便于统计与运营策略。\n

