# Story 010：web-admin 路径报表页（筛选器 + Top paths 列表）

| 属性 | 内容 |
|------|------|
| 状态 | **待审批**（2026-04-22） |
| 所属 Feature | `.ai/features/feature-analytics-path.md` |
| 优先级 | P0 |
| 预估 | 1–2 天 |

---

## 1. 目标

在 web-admin 增加路径报表页：

- 起点事件、路径长度、维度过滤
- 展示 Top paths（列表/树状缩进均可，先做可读性优先）

---

## 2. 验收标准

1. 切换筛选条件刷新 Top paths 结果。
2. 空/错态提示清晰。

---

## 3. 测试策略

- 前端 Vitest：筛选交互 + 空/错态渲染。

---

## 4. 依赖

- Story 009（路径 API）

