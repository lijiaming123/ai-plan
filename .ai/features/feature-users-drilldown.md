# Feature：用户画像与 drill-down（只读优先）

| 属性 | 内容 |
|------|------|
| 状态 | **待审批**（2026-04-22） |
| 所属 Epic | `.ai/epics/epic-web-admin-growth-analytics.md` |
| 优先级 | P0 |
| 目标产出 | 从报表定位到用户，并查看最小画像与关键事件摘要 |

---

## 1. 目标

交付最小用户管理能力（只读优先）：

- 用户列表：搜索/过滤/分页
- 用户详情：注册时间、最近活跃、关键计数（计划数/打卡数/关键事件）
- 支持从分析报表 drill-down 跳转并带过滤条件

---

## 2. 验收标准

1. 报表 drill-down 可跳转到用户列表并正确应用过滤条件。
2. 用户详情能展示关键画像字段与事件摘要，不暴露敏感明文字段。

---

## 3. 关联 Stories（建议）

- S1：`GET /admin/users` 列表接口（含过滤/分页）+ web-admin 页面
- S2：`GET /admin/users/:id` 详情接口 + web-admin 页面
- S3：与报表 drill-down 的参数协议（统一 filter schema）

