# Feature：留存分析（Cohort）

| 属性 | 内容 |
|------|------|
| 状态 | **待审批**（2026-04-22） |
| 所属 Epic | `.ai/epics/epic-web-admin-growth-analytics.md` |
| 优先级 | P0 |
| 目标产出 | 次日/7日/30日留存 cohort 矩阵与趋势 |

---

## 1. 目标

交付留存报表页面与查询接口，支持：

- Cohort：默认注册日；可选首创计划日/首次打卡日（P1）
- 活跃定义：默认 `dashboard_view OR checkin_submit`
- 输出：留存矩阵（cohort×天数）+ 趋势图
- 维度切片：渠道/版本/平台

---

## 2. 验收标准

1. 留存矩阵可查看次日/7日/30日留存，且与抽样 SQL 对账一致。
2. 切换维度（渠道/版本/平台）能得到不同 cohort 结果。

---

## 3. 关联 Stories（建议）

- S1：实现 `GET /analytics/retention`（注册 cohort + 活跃定义 v1）
- S2：web-admin 留存页面（矩阵 + 趋势）
- S3：留存 drill-down（点击某 cohort 某日到用户列表）

