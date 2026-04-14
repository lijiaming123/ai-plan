# Epic：用户端概览页与计划完成热力图

| 属性 | 内容 |
|------|------|
| 状态 | **S1–S4 已实施**（待产品联调验收） |
| 优先级 | P1 |
| 关联 PRD | `.ai/specs/2026-04-14-dashboard-overview-prd.md` |
| 关联架构 | `.ai/arch.md` |

## 目标

交付用户端「概览」页及类 GitHub 的**计划完成热力图**（绿/红/中性、Tooltip、图例），数据由后端按日聚合，与已定稿计划及打卡提交一致。

## 业务价值

提升执行反馈感与留存；避免把「无安排日」标红造成挫败。

## 验收标准（Epic 级）

- [x] 登录用户可打开概览页并看到热力图与图例。
- [x] 单日状态与 PRD §5.1 一致（绿/红/灰），Tooltip 含日期与摘要（与 API 一致）。
- [x] 仅当前用户数据；错误提示为中文友好文案。
- [x] API 与核心聚合逻辑具备自动化测试。

## 故事列表（实施顺序）

| ID | 故事 | 状态 | 备注 |
|----|------|------|------|
| S1 | 后端：`GET /me/plan-heatmap` + 按日聚合服务（日粒度 slotKey + submissions；周粒度 v1 映射函数）+ Vitest | **已完成** | `me.routes.ts`、`plan-heatmap.service.ts`、`tests/plan-heatmap.test.ts` |
| S2 | 前端：`api-client` 方法 + 概览路由与页面壳（加载/错误） | **已完成** | 沿用 `/dashboard`，`getPlanHeatmap` + `DashboardPage` |
| S3 | 前端：`HeatmapGrid`（网格、月标签、Tooltip、图例、窄屏横向滚动）+ 组件测 | **已完成** | `PlanHeatmapGrid.vue`、`plan-heatmap-grid.test.ts` |
| S4 | 导航入口（侧栏/顶栏）与联调验收 | **已完成** | 侧栏「仪表盘」改为「概览」；Vite 代理 `/me` |

## 依赖

- 现有 JWT 鉴权、`Plan` / `PlanVersion` / `PlanScheduleSlotSubmission` 模型。
- PRD 待决策：周槽位映射细则、年份切换 P0/P1（默认可先不做年份 UI，仅当年）。

## 风险

- 周粒度 `Wn` 映射若产品未定，S1 需先落地可配置/可测的 v1 规则并在 PRD 补丁中固化。
