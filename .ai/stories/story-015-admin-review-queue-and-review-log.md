# Story 015：审核队列 API + approve/reject + 审核记录（reasonCode）

| 属性 | 内容 |
|------|------|
| 状态 | **待审批**（2026-05-09） |
| 所属 Feature | `.ai/features/feature-template-review-and-moderation.md` |
| 优先级 | P0 |
| 预估 | 2–5 天 |

---

## 1. 目标

- 新增 admin API：\n
  - `GET /admin/templates/review-queue`（分页、按状态/时间/作者过滤）\n
  - `POST /admin/templates/:id/approve`\n
  - `POST /admin/templates/:id/reject`（reasonCode + note）\n
- 引入审核记录：TemplateReviewLog（或等价结构），包含：\n
  - templateId、reviewerId、decision、reasonCode、note、createdAt\n
- 审核动作写审计（模板域审计口径的一部分）\n

---

## 2. 验收标准

1. 审核员可看到待审列表并通过/驳回。\n
2. 驳回必须填写 reasonCode；作者侧可见驳回原因摘要。\n
3. 通过后模板进入 published 并在公开市场可见。\n
4. 审核记录可查询（最小用于排查与统计）。\n

---

## 3. 测试策略

- API 单测：\n
  - 权限校验（无权限 403）\n
  - approve/reject 状态迁移正确\n
  - review log 写入正确\n

---

## 4. 依赖

- Story 013 状态机\n
- 管理端 RBAC/审计基础设施（若已有则复用）\n

