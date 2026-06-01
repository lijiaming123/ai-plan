# Story 019：模板版本化（MarketTemplateVersion）+ apply 绑定版本

| 属性 | 内容 |
|------|------|
| 状态 | **待审批**（2026-05-09） |
| 所属 Feature | `.ai/features/feature-template-versioning-and-preview.md` |
| 优先级 | P1 |
| 预估 | 3–7 天 |

---

## 1. 目标

- 引入 `MarketTemplateVersion`：保存 payload 快照与 hash\n
- publish/update 生成版本：\n
  - 新发布：创建 version=1 并进入审核/发布流程\n
  - 更新：创建新版本并重新审核（或先进入 pending_review）\n
- apply 绑定版本：\n
  - apply 接口内部确定当前对外版本并记录 versionId（审计/统计）\n
- 兼容迁移：为历史 published 模板补齐初始版本并回填 `currentPublishedVersionId`\n

---

## 2. 验收标准

1. 已发布模板存在可回溯版本快照；apply 可追溯到版本。\n
2. 更新模板不会破坏已套用历史的可复现性。\n

---

## 3. 测试策略

- API 单测：版本创建、currentPublishedVersionId 更新、apply 绑定版本\n

---

## 4. 依赖

- Story 013 状态机\n

