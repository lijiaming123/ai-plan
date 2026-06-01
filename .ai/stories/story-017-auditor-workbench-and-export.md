# Story 017：审计员工作台 + 审计导出

| 属性 | 内容 |
|------|------|
| 状态 | **已完成**（2026-06-01） |
| 所属 Feature | `.ai/features/feature-auditor-workbench.md` |
| 优先级 | P0 |
| 预估 | 1 天 |

---

## 1. 目标

强化 `AuditLogsPage` 为审计员主工作台，支持摘要区与 CSV 导出。

---

## 2. 任务清单

- [ ] `audit-action-dictionary.ts`：高风险 action 列表与中文标签
- [ ] `AuditLogsPage`：顶栏摘要（条数、高风险计数）、快捷筛选 chips
- [ ] 导出当前筛选结果 CSV（需 `analytics:export`）+ `audit.export` 审计
- [ ] 登录 E2E 手动：auditor 默认进本页

---

## 3. 验收标准

1. auditor preset 登录 URL 为 audit-logs。
2. 导出产生 audit.export 记录。

---

## 4. 依赖

- Story 013、016（csv 工具复用）
