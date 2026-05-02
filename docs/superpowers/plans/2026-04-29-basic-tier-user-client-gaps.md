# 基础版（普通版）用户端能力缺口与补齐计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `authState.tier === 'basic'` 下，消除「有导航无能力」的落差，使归档、统计分析、账号找回等能力与导航/文案承诺一致，达到可对外说明的「基础版功能完整」标准。

**Architecture:** 优先补齐 **后端状态 + API + web-user 列表/操作** 的垂直切片（归档）；统计分析走 **聚合只读 API** 替换 `InsightsPage` 占位；忘记密码走 **可选邮件服务或明确演示禁用** 的产品决策；导航层对未就绪能力采用 **显式「即将推出」或临时隐藏** 降低误导。

**Tech Stack:** 现有 monorepo（Go API + `apps/web-user` Vue 3 + Vitest）、`getApiClient` 模式、`PlanListRow` / 计划状态枚举扩展。

**依据:** using-superpowers（技能先行）；代码现状盘点（`router/index.ts`、`ArchivePage.vue`、`InsightsPage.vue`、`ForgotPasswordPage.vue`、`DashboardPage.vue`、`TemplatesPage.vue`、`NotificationsPage.vue`）。

---

## 0. 结论摘要（给产品/接手人）

| 维度 | 判断 |
|------|------|
| **核心闭环** | 已具备：认证（除找回密码）、普通版创建与草稿流式、计划列表/搜索/回收站、详情执行与打卡、任务提交与结果页、模板市场与「我的」、通知中心与偏好、设置与展示名、概览热力图+近期计划、帮助与 FAQ。 |
| **明显缺口** | ① `/archive` 为纯占位，侧栏却有「归档」入口；② `/insights` KPI 与趋势为占位「—」，与页内「接入后将替换」一致但**未接 API**；③ `/auth/forgot-password` 无提交逻辑，属**静态演示**；④ 与「正式环境」相关的审核/评分在帮助文案中为占位说明（可接受为 MVP，但需在帮助中显式标注）。 |

**是否基本满足使用：** 若以「个人完成计划、打卡、用模板」为定义 — **基本满足**。若以「侧栏所有菜单均可真实使用」为定义 — **未满足**，按本计划分优先级补齐。

---

## 1. 文件与职责映射（实施前锁定）

| 能力 | 新建/修改（示例） |
|------|-------------------|
| 归档 | DB：`plans` 增加 `archived_at`（或状态枚举）；Go：归档/取消归档/列表筛选；`api-client.ts`；`ArchivePage.vue`；可选 `PlanOverviewPage` / `PlanDetailPage` 入口 |
| 统计分析 P1 | Go：聚合接口（活跃计划数、本周槽位完成数、加权进度）；`api-client.ts`；`InsightsPage.vue` 替换占位 |
| 忘记密码 | Go：token + 邮件或 magic link（若暂无邮件则用「演示环境关闭」）；`ForgotPasswordPage.vue` 表单与错误态 |
| 导航诚实性 | `UserShellLayout.vue`：feature flag 或环境变量控制「归档/洞察」显隐；或保留入口但在页头强化「开发中」 |

---

## 2. 分阶段任务（ bite-sized ）

### Task A: 归档 — 数据模型与 API

**Files:**

- Modify: 后端迁移与 plan 模型（路径以仓库实际 `services/api` 或 `cmd` 为准）
- Modify: `apps/web-user/src/lib/api-client.ts`
- Test: 后端 plan 归档相关单测 + `apps/web-user/tests/` 新增或扩展 archive 相关用例

- [ ] **Step 1:** 确认计划生命周期：与 `deleted_at` 软删互斥规则（归档前须非删除，或从回收站恢复后才能归档）。
- [ ] **Step 2:** 写失败用例：未认证不可归档；写成功用例：归档后列表默认不出现、归档列表出现。
- [ ] **Step 3:** 实现 `PATCH /plans/:id/archive` 与 `PATCH /plans/:id/unarchive`（或等价 REST 设计），及 `listPlans` 增加 `status=archived` 筛选。
- [ ] **Step 4:** 跑测试至绿，提交小步 commit。

### Task B: 归档 — 用户端 `ArchivePage`

**Files:**

- Modify: `apps/web-user/src/features/archive/ArchivePage.vue`
- Modify: `PlanDetailPage.vue` 或 `PlanOverviewPage.vue`（增加「归档」操作与确认对话框，复用 `UiConfirmDialog` 模式）

- [ ] **Step 1:** Vitest：挂载 `ArchivePage`，mock API 返回 1 条归档计划，断言卡片/链接可达详情。
- [ ] **Step 2:** 实现列表、空态、错误态、取消归档入口（与后端对齐）。
- [ ] **Step 3:** 全量相关测试绿。

### Task C: 统计分析 — 聚合 API 与页面接线

**Files:**

- Modify: Go 聚合 handler + route 注册
- Modify: `apps/web-user/src/lib/api-client.ts`
- Modify: `apps/web-user/src/features/insights/InsightsPage.vue`
- Ref: `docs/superpowers/specs/2026-04-15-insights-page-development-plan.md`（P1 节）

- [ ] **Step 1:** 定义响应 DTO（三 KPI + 可选周序列），与 `InsightsPage` 现有卡片 id 对齐。
- [ ] **Step 2:** 后端单测：无计划、多计划、有打卡数据的聚合正确性。
- [ ] **Step 3:** 前端 `onMounted` 拉取；失败时保留「—」并展示轻量错误条（与 `DashboardPage` 一致模式）。
- [ ] **Step 4:** Vitest mock API 断言渲染数字非「—」。

### Task D: 忘记密码 — 产品决策与最小实现

**Files:**

- Modify: `ForgotPasswordPage.vue`
- Modify: 后端 auth 路由（若启用）
- Modify: `HelpPage.vue` FAQ 一条同步说明

- [ ] **Step 1:** 决策记录：演示环境 **A)** 接真实发信 **B)** 返回「功能未开放」+ 联系管理员 **C)** 仅前端 toast「演示无邮件」。
- [ ] **Step 2:** 按决策实现：按钮可点击、有 loading、有明确反馈；禁止静默无操作。
- [ ] **Step 3:** 单测或 e2e 覆盖一次提交路径。

### Task E: 导航与期待管理（可选但推荐）

**Files:**

- Modify: `apps/web-user/src/layouts/UserShellLayout.vue`
- Optional: `.env.example` 增加 `VITE_FEATURE_ARCHIVE` / `VITE_FEATURE_INSIGHTS`

- [ ] **Step 1:** 在归档/洞察未接 API 前，可通过 env 隐藏侧栏项，或保留并在二级页顶显示「Beta / 开发中」横幅（二选一，与产品一致即可）。

---

## 3. 验收清单（基础版 smoke）

- [ ] 基础版账号：创建 → 定稿 → 详情打卡 → 通知列表可加载。
- [ ] 归档：至少一条计划可归档并在 `/archive` 可见；可取消归档回到 `/plans`。
- [ ] 洞察：三 KPI 为真实数字或经确认的「0」，非无限占位。
- [ ] 忘记密码：用户点击后有可理解的系统反馈，与帮助文档一致。

---

## 4. 显式非目标（本计划不展开）

- 专业版专属：深度拆解、智能提醒策略生成（已有独立 spec/plan）。
- 统计分析 P2：ECharts 深度图表、导出 CSV（见 insights spec P2）。
- 移动端独立 App。

---

**制定说明:** 用户要求结合 **using-superpowers**：本计划在执行各 Task 前仍应按需加载 **brainstorming**（若归档与软删交互有争议）、**writing-plans** 子任务拆解、**verification-before-completion** 在宣称完成前跑全量相关测试。
