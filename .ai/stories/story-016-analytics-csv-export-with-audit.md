# Story 016：分析 CSV 导出 + 审计

| 属性 | 内容 |
|------|------|
| 状态 | **已完成**（2026-06-01） |
| 所属 Feature | `.ai/features/feature-analytics-export-audit.md` |
| 优先级 | P0 |
| 预估 | 1 天 |

---

## 1. 目标

漏斗/留存/路径页支持 CSV 导出，校验 `analytics:export`，写审计。

---

## 2. 任务清单

- [ ] `lib/csv-export.ts`：`downloadCsv(filename, rows, columns)` + UTF-8 BOM
- [ ] `POST /admin/audit-logs/record` 或 service 层 `recordAudit`（内部，非公开）— 或 analytics 路由内直接写库
- [ ] `FunnelPage` / `RetentionPage` / `PathPage`：导出按钮 + permission guard
- [ ] 导出前调用 record API：`action=analytics.export`, summary=筛选条件
- [ ] 单测：csv 工具函数；页面 mock 无 export 时按钮 disabled

---

## 3. 验收标准

1. analyst 可导出；只读 mock 不可。
2. 导出后 audit_log 可查。

---

## 4. 依赖

- Story 013（export 权限在 analyst preset 中）
