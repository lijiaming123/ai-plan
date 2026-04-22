# Story 002：Telemetry ingest 接口 v1（双轨鉴权 + 限流）

| 属性 | 内容 |
|------|------|
| 状态 | **待审批**（2026-04-22） |
| 所属 Feature | `.ai/features/feature-telemetry-ingest-governance.md` |
| 优先级 | P0 |
| 预估 | 2–3 天 |

---

## 1. 目标

实现 `POST /telemetry/events` v1，支持：

- 登录用户 token 上报
- 匿名签名/匿名 key 上报（双轨）
- 批量事件提交（一次多条）
- 基础限流与 dropped reason 统计

---

## 2. 范围

### In Scope

- ingest 路由 + 鉴权与限流
- 与 Story 001 的事件字典校验集成
- 统一返回 `{ accepted, dropped, reasonCounts }`

### Out of Scope

- 前端 SDK 封装（另一个 story）

---

## 3. 验收标准

1. token 上报成功落库；匿名上报成功落库（在限流策略允许内）。
2. 不合法事件名/字段被拒绝或丢弃，并在 `reasonCounts` 中体现。
3. 高并发/恶意请求被限流，不影响业务 API（观察到 429/丢弃计数）。

---

## 4. 测试策略

- API 单测：token/匿名两种鉴权；限流触发；非法事件名/字段。

---

## 5. 依赖

- Story 001（事件字典 v1）

