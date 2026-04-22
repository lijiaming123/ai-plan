# 规格：Telemetry 事件字典 v1（命名 / 属性 / 脱敏）

| 属性 | 内容 |
|------|------|
| 状态 | **已批准**（2026-04-22） |
| 关联 PRD | `.ai/specs/2026-04-22-web-admin-growth-analytics-prd.md` |
| 适用端 | `web-user`（采集）→ `api`（接收/治理）→ `web-admin`（报表） |
| 版本 | v1 |

---

## 1. 目标

用“可执行的字典”统一埋点口径，保证：

- 事件名稳定、可扩展
- properties 可控（白名单 + 类型校验）
- 敏感字段禁止采集（服务端兜底丢弃/拒绝）
- 维度标准化（渠道/版本/平台）

---

## 2. 公共字段（所有事件）

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 事件名（见第 3 节） |
| `time` | string | ISO 时间（客户端时间；服务端会记录 receivedAt） |
| `sessionId` | string? | 会话 id（v1 可选） |
| `page` | string? | 页面/路由标识（v1 可选） |
| `properties` | object? | 事件属性（必须符合事件白名单） |

服务端补充维度（不允许客户端覆盖）：

- `userId`（token 登录时）
- `source`（渠道；来自请求头/参数或后续统一注入）
- `platform`（web/ios/android…）
- `clientVersion`

---

## 3. 事件清单（v1）

### 3.1 认证与会话

- `auth_register`
  - **触发**：注册成功
  - **properties**：`method`（email/sms/other，可选）
- `auth_login`
  - **触发**：登录成功
  - **properties**：`method`（password/oauth/other，可选）

### 3.2 核心业务（计划/打卡）

- `plan_create`
  - **触发**：创建计划成功（草稿也算）
  - **properties**：`planId`（string，可选）、`type`（string，可选）
- `plan_publish`
  - **触发**：计划定稿/发布成功
  - **properties**：`planId`（string，必填）
- `dashboard_view`
  - **触发**：进入概览页
  - **properties**：`route`（string，可选）
- `checkin_submit`
  - **触发**：提交打卡成功
  - **properties**：`planId`（string，可选）、`slotKey`（string，可选）

---

## 4. 禁止采集与脱敏规则（v1）

### 4.1 禁止字段（出现即丢弃并计数）

以下字段名（大小写不敏感）禁止出现在 `properties` 中：

- `password`
- `phone` / `mobile`
- `email`
- `idCard` / `id_card`
- `realName` / `name`
- `address`

### 4.2 脱敏策略

- v1 默认：**直接丢弃敏感字段**（不做哈希存储），并在服务端 `reasonCounts` 中计数
- 若后续需要“去重但不可逆”：再引入 `sha256(salt + value)`（P1）

---

## 5. 命名规范

- 事件名：`snake_case`，域前缀 + 动作，例如 `plan_create`
- properties：`camelCase`（与现有前端习惯对齐），例如 `planId`、`slotKey`
- `page/route`：建议用 router name 或稳定路径 key（避免含 userId 等动态段）

---

## 6. 待扩展项（v2 候选）

- 性能事件：`perf_web_vitals`、`perf_navigation_timing`
- 错误事件：`error_js`、`error_resource`
- 触达：`notification_delivered`、`notification_clicked`

