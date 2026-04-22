# Feature：路径分析（Top paths）

| 属性 | 内容 |
|------|------|
| 状态 | **待审批**（2026-04-22） |
| 所属 Epic | `.ai/epics/epic-web-admin-growth-analytics.md` |
| 优先级 | P0 |
| 目标产出 | 从起点事件出发的 Top 路径与流失断点 |

---

## 1. 目标

交付路径分析页面与查询接口，支持：

- 起点事件选择（默认 `dashboard_view`）
- 路径长度 3–6 步
- 过滤：仅流失人群/仅完成目标人群（P1 可扩展）
- 输出：Top paths 占比、常见断点（最后事件）

---

## 2. 验收标准

1. 能从起点事件生成 Top 路径列表与占比。
2. 支持基础维度切片（渠道/版本/平台）。

---

## 3. 关联 Stories（建议）

- S1：实现 `GET /analytics/path`（v1：sessionId 优先，无则短窗口近似）
- S2：web-admin 路径页面（筛选器 + 路径列表）

