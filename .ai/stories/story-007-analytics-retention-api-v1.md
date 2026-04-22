# Story 007：留存 API v1（注册 cohort + 活跃定义 v1）

| 属性 | 内容 |
|------|------|
| 状态 | **待审批**（2026-04-22） |
| 所属 Feature | `.ai/features/feature-analytics-retention.md` |
| 优先级 | P0 |
| 预估 | 2–3 天 |

---

## 1. 目标

实现 `GET /analytics/retention` v1：

- cohort：注册日
- 活跃：`dashboard_view OR checkin_submit`
- 输出：留存矩阵 + 趋势（次日/7日/30日）
- 维度过滤：渠道/版本/平台

---

## 2. 验收标准

1. 抽样对账：同条件下 API 输出与 SQL/夹具一致。
2. 支持维度过滤并影响 cohort 结果。

---

## 3. 测试策略

- API 单测：夹具用户/事件/业务表数据 → 留存矩阵断言。

---

## 4. 依赖

- Story 004（聚合基座）或至少 raw 可查

