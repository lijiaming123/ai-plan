# Story 020：模板详情页 + 结构化预览（不暴露完整 payload）

| 属性 | 内容 |
|------|------|
| 状态 | **待审批**（2026-05-09） |
| 所属 Feature | `.ai/features/feature-template-versioning-and-preview.md` |
| 优先级 | P1 |
| 预估 | 3–7 天 |

---

## 1. 目标

- web-user 新增路由：`/templates/market/:id`\n
- API：详情返回公开字段 + 结构化预览（例如 goal/deadline/type/summary/tags/granularity）\n
- 预览生成策略：\n
  - 从版本 payload 解析出可读字段（复用 `parseTemplatePayload` 输出）\n
  - 不直接返回完整 payload（避免隐私/滥用）\n

---

## 2. 验收标准

1. 详情页可展示模板信息与预览；未发布模板返回 404。\n
2. 用户可从详情页套用模板。\n

---

## 3. 测试策略

- web-user：详情页渲染、404/错误态、套用跳转\n
- API：详情接口字段裁剪与权限/状态过滤\n

---

## 4. 依赖

- Story 019 版本化（用于预览数据源）\n

