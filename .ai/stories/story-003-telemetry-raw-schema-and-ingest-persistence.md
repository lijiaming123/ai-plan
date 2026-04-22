# Story 003：raw 事件表落库（schema + 索引）与 ingest 持久化

| 属性 | 内容 |
|------|------|
| 状态 | **待审批**（2026-04-22） |
| 所属 Feature | `.ai/features/feature-telemetry-ingest-governance.md` |
| 优先级 | P0 |
| 预估 | 1–2 天 |

---

## 1. 目标

把 ingest 接收到的事件稳定落入数据库 raw 表，并具备基础查询与索引支撑聚合/排障。

---

## 2. 范围

### In Scope

- `telemetry_raw_events`（或等价命名）表结构
- 基础索引（按 `eventName + day`、`userId + eventTime`、`source/platform/clientVersion`）
- ingest 写入逻辑（批量插入）

### Out of Scope

- 分区表/归档（P1）

---

## 3. 验收标准

1. ingest 接口上报事件后，raw 表可查到记录（含标准化维度列）。
2. 关键索引生效（解释计划/简单压测验证）。

---

## 4. 测试策略

- API 单测：上报后查询 raw（或通过 service mock 验证写入调用）。

---

## 5. 依赖

- Story 001、Story 002

