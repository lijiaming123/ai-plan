# Feature：Telemetry 事件接收与治理（ingest + 校验 + 脱敏）

| 属性 | 内容 |
|------|------|
| 状态 | **待审批**（2026-04-22） |
| 所属 Epic | `.ai/epics/epic-web-admin-growth-analytics.md` |
| 优先级 | P0 |
| 目标产出 | 可稳定接收 web-user 事件并保证合规与可聚合 |

---

## 1. 目标

提供 v1 的 Telemetry 接收入口与治理机制，保证：

- 事件可批量上报、可鉴权（双轨）
- 事件名/属性按字典校验
- properties 脱敏/丢弃敏感字段
- 基础限流与丢弃统计可观测

---

## 2. 范围

### In Scope

- `POST /telemetry/events`（批量）
- 事件字典 v1（服务端 schema registry）
- 脱敏与白名单校验
- 限流（按 IP/匿名 key/用户）
- 落库 raw 表（Postgres）

### Out of Scope

- 全量 A/B、跨端统一 id（P2）
- 复杂异常聚合与告警（P1/P2）

---

## 3. 验收标准

1. 登录用户带 token 上报事件，服务端返回 accepted/dropped 统计并成功落库。
2. 未登录匿名上报（签名/匿名 key）可被接收（按决策双轨），且被限流保护。
3. 不在字典中的事件名被拒绝或计为 dropped（按策略）。
4. properties 中出现敏感字段时被移除或拒绝，并可在日志/指标里看到原因计数。

---

## 4. 依赖

- DB schema 迁移能力（Prisma）
- 管理端 RBAC 与审计（后续 feature）

---

## 5. 关联 Stories（建议）

- S1：定义事件字典 v1 与服务端校验策略
- S2：实现 ingest 接口（token + 匿名双轨）与限流
- S3：raw 表落库与最小可观测（dropped reason 计数）

