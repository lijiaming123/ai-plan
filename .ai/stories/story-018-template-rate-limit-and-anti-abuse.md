# Story 018：基础频控（发布/点赞/收藏/套用/举报）+ 可观测 reasonCounts

| 属性 | 内容 |
|------|------|
| 状态 | **待审批**（2026-05-09） |
| 所属 Feature | `.ai/features/feature-template-anti-abuse.md` |
| 优先级 | P0 |
| 预估 | 1–3 天 |

---

## 1. 目标

- 在模板域对以下动作加入基础限流：\n
  - publish / like / favorite / apply / report\n
- 限流维度：userId（登录）+ IP（匿名或补充）\n
- 可观测：\n
  - 429 次数与 endpoint 分布\n
  - 原因码统计（例如 too_many_requests / duplicated_submit）\n

---

## 2. 验收标准

1. 超限返回 429，前端可展示友好提示。\n
2. 重复请求不会造成 likeCount/applicationCount 异常。\n
3. 限流/拒绝原因可统计（日志或 telemetry）。\n

---

## 3. 测试策略

- API 单测：连续请求触发 429；重复操作不改变计数\n

---

## 4. 依赖

- 既有 rate limit 工具（若无则新增轻量实现）\n

