# ADR：MVP 阶段 C 端不开放独立「模板」模块

| 属性 | 内容 |
|------|------|
| 状态 | **已采纳** |
| 日期 | 2026-06-23 |
| 决策 | MVP 商用化阶段隐藏模板一级导航与 UGC 市场入口，保留后端与数据；官方预设内化至「创建计划」页 |

---

## 背景

PlanMaster 核心闭环为：创建计划 → AI 草稿 → 定稿 → 打卡执行 → 归档。独立「模板」模块（系统预设 + 用户 UGC 市场）为增强能力，非主路径必需。

MVP 早期上线需聚焦 **AI 计划生成 + 执行闭环**，并降低 UGC 带来的审核、举报、合规与运营固定成本。

## 决策

1. **C 端默认关闭** `VITE_FEATURE_TEMPLATES`（侧栏「模板」、 `/templates*` 路由重定向、计划详情「发布为模板」）。
2. **不删库、不删 API**：模板域代码与 Prisma 表保留，便于 Phase 2 按数据门禁重启。
3. **冷启动替代**：模板模块关闭时，在 [`PlanCreatePage`](../../apps/web-user/src/features/plans/PlanCreatePage.vue) 内嵌「官方示例」，点击预填表单而非跳转独立市场页。

## 后果

- 正面：产品认知更聚焦、发布回归面更小、无 UGC 运营负担。
- 负面：社区内容与模板市场增长能力暂不可用；已有深度链接 `/templates/*` 将重定向至创建页。
- 重启条件：见 [Phase 2 门禁指标](./2026-06-23-template-market-phase2-gates.md)。

## 实现要点

- 功能开关：[`apps/web-user/src/lib/feature-flags.ts`](../../apps/web-user/src/lib/feature-flags.ts)
- 测试环境：`vite.config.ts` 中 `VITE_FEATURE_TEMPLATES=true`，保证模板相关 Vitest 仍可运行。
