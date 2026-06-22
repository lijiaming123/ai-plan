# Story 019：Telemetry 日聚合运维 UI（P1）

| 属性 | 内容 |
|------|------|
| 状态 | **待办** |
| 所属 Feature | `.ai/features/feature-telemetry-ops-ui.md`（待创建） |
| 优先级 | P1 |
| 预估 | 0.5 天 |

---

## 1. 目标

暴露已有 `POST /admin/telemetry/aggregate-day?day=YYYY-MM-DD` 为可操作的运维入口。

---

## 2. 任务清单

- [ ] Dashboard 超管/运营区或 `/admin/telemetry` 页
- [ ] UTC 日期选择 + 触发 + 结果 Toast
- [ ] 权限：`analytics:read`（与现有 API 一致）

---

## 3. 依赖

- Story 013（模块可见性）
