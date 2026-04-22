# Story 009：路径 API v1（Top paths，session 优先/短窗口近似）

| 属性 | 内容 |
|------|------|
| 状态 | **待审批**（2026-04-22） |
| 所属 Feature | `.ai/features/feature-analytics-path.md` |
| 优先级 | P0 |
| 预估 | 2–3 天 |

---

## 1. 目标

实现 `GET /analytics/path` v1：

- 起点事件选择（默认 `dashboard_view`）
- 路径长度 3–6
- 维度过滤：渠道/版本/平台
- 计算：sessionId 优先；无 sessionId 时用短时间窗口近似

---

## 2. 验收标准

1. 在夹具数据下返回稳定的 Top 路径与占比。
2. 支持维度过滤并影响路径结果。

---

## 3. 测试策略

- API 单测：构造 session 内事件序列 → Top paths 断言。

---

## 4. 依赖

- Story 003（raw 可查）与 ingest 数据基础

