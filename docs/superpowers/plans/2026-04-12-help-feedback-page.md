# 帮助与反馈页增强 Implementation Plan

> **For agentic workers:** 使用 `executing-plans` 按任务勾选执行。

**Goal:** 将「帮助与反馈」从三块静态文案升级为可用的 **帮助中心**：分类与搜索、可展开 FAQ、快捷入口、本地反馈提交（`mailto`），减少首屏以下空洞感；**不新增后端 API**。

**Architecture:** 单文件 `HelpPage.vue`（`<script setup>`）内维护 `FAQ` 常量数组；筛选为客户端 `computed`；反馈表单用 `mailto:` + `encodeURIComponent`，支持可选 `VITE_SUPPORT_EMAIL`（默认 `support@ai-plan.dev`）。

**Tech Stack:** Vue 3、Vue Router、`apps/web-user`、Vitest。

---

## Tasks

### Task 1: 计划文档与数据模型

- [x] 定义 `FaqItem`：`id`、`category: 'plan' | 'task' | 'account' | 'template'`、`title`、`body`、`keywords: string`（用于搜索）。

### Task 2: `HelpPage.vue` 实现

- [x] **快捷入口**：`router-link` 至 `/plans/new`、`/plans`、`/templates`（或 `/notifications`），卡片式。
- [x] **搜索**：`input type="search"`，`data-testid="help-search"`，对 title+body+keywords 做不区分大小写子串匹配。
- [x] **分类**： pill：`全部 | 计划 | 任务 | 模板 | 账号`，`data-testid="help-cat-{id}"`。
- [x] **FAQ**：`details/summary` 或可聚焦的 button+region，每项 `data-testid="help-faq-item-{id}"`；无结果时 `data-testid="help-faq-empty"`。
- [x] **反馈区**：类型下拉（建议/故障/其他）、多行正文、`data-testid="help-feedback-body"`、提交 `data-testid="help-feedback-submit"` → 打开 `mailto:`。
- [x] **视觉**：`font-plan`、与设置页类似的轻渐变底 + 白卡片，避免大块留白。

### Task 3: 测试

- [x] 新建 `tests/help-page.test.ts`：挂载页、搜索过滤、分类 pill、存在反馈提交按钮。

### Task 4: 文档

- [x] `.env.example` 增加可选 `VITE_SUPPORT_EMAIL` 说明；`runbook.md` 一句帮助页反馈走 mailto。

---

**状态：** 已完成（2026-04-12 已落地并通过 `pnpm --filter @ai-plan/web-user test`）。
