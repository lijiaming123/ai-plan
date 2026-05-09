# Feature：版本化 + 详情页/预览（apply 绑定版本）

| 属性 | 内容 |
|------|------|
| 状态 | **待审批**（2026-05-09） |
| 所属 Epic | `.ai/epics/epic-web-user-template-market-ugc.md` |
| 优先级 | P1 |
| 目标产出 | 模板可复现、可回溯、可提升套用转化 |

---

## 1. 目标

- 引入 `MarketTemplateVersion` 保存 payload 快照版本\n
- publish/update 生成新版本，公开展示使用 currentPublishedVersionId\n
- apply 绑定 versionId（审计/统计）\n
- web-user 新增模板详情页与结构化预览（不暴露完整 payload）\n

---

## 2. 验收标准

1. 每次发布/更新都会生成版本快照，且可回溯。\n
2. apply 记录可追溯到模板版本。\n
3. 模板详情页可展示结构化预览信息。\n

---

## 3. 关联 Stories（建议）

- Story 019：版本快照 + apply 绑定版本\n
- Story 020：模板详情页 + 预览\n

