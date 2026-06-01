# 其它（general）计划：Checkbox-only 打卡 + 仅文字备注（商用落地）

**日期**：2026-05-09  
**版本**：v1（待确认）  
**范围**：当用户在创建页选择“其它场景”（`planScenario=other` → DB `Plan.type=general`）时，打卡与生成逻辑采用 checkbox_only（勾选完成/撤销 + 可选文字备注），不支持附件，不触发 AI 核验/申诉。  

---

## 1. 背景与目标

当前系统已经对两类场景做了分流：
- **学习（study）**：提交证明 → AI 核验 → 申诉（强门槛，适合“质量判定”）
- **旅游（travel）**：勾选完成/撤销 + 可选旅行记录（照片优先，低摩擦）

但“其它”场景（落库为 `type=general`）的用户目标多为习惯/事务/里程碑/轻健康/轻工作推进，完成判定通常是**自我确认**而非“需要判卷”。继续沿用学习式强核验会显著提高摩擦，降低完成率与留存。

### 目标
- **默认低摩擦**：其它计划的打卡主动作是勾选完成/撤销。
- **轻量留痕**：可选**仅文字备注**（一句话）。
- **零核验**：不触发 AI 核验，不产生 422，不出现申诉入口。
- **成本可控**：不支持附件/外链，避免存储与风控复杂度扩散。

### 非目标
- 不做新的 `Plan.type` 枚举扩展（仍使用 `general`）。
- 不做挑战赛/权益兑换等强核验玩法（后续可通过策略层扩展）。

---

## 2. 策略定义（Check-in Policy）

本规格引入一条明确策略（可先在代码中 hardcode）：
- **general / other 场景**：`checkbox_only`
  - 完成：勾选即可（允许空 content）
  - 备注：可选文字（content 非空）
  - 禁止 attachments
  - 不核验，不申诉

与现有策略对齐：
- `study`：`proof_required`
- `travel`：`record_optional`

---

## 3. 后端接口与行为

### 3.1 POST 创建/更新打卡（复用现有接口）
`POST /plans/:id/schedule/slots/:slotKey/checkins`

当 `Plan.type === "general"`（且业务上属于“其它场景”）时：
- **允许** `content` 为空/缺失（视为“勾选完成”）
- **允许** `content` 非空（视为“文字备注”）
- **禁止** `attachments`：
  - 若请求体中 `attachments.length > 0` → 返回 `400 Bad Request`
  - 响应 `{ message: "attachments not allowed for this plan type" }`（或等价文案）
- **不触发** AI 核验：
  - 不调用 `evaluateCheckinSubmission`
  - 不返回 422
  - 不写 review
- **返回** 201 + `{ submission }`（保持与现有一致）

### 3.2 DELETE 撤销完成（复用现有关闭机制）
`DELETE /plans/:id/schedule/slots/:slotKey/checkins`

当 `Plan.type === "general"`（checkbox_only）或 `Plan.type === "travel"` 时允许：
- 行为：将该 slot 最新一条 `closedAt is null` 的 submission 设置 `closedAt=now`
- 不存在时：404

当 `Plan.type !== "general" && Plan.type !== "travel"` 时：
- 返回 403（避免学习型“证明”被撤销导致规则绕过）

> 注：`closedAt` 已存在于 `PlanScheduleSlotSubmission`，并且聚合已按 `closedAt is null` 过滤。

---

## 4. 前端交互（web-user）

### 4.1 详情页（PlanDetail）
当 `plan.type === "general"` 时：
- 主按钮：**勾选完成/撤销完成**
- 次按钮：**添加备注**（打开轻量抽屉或 inline textarea）
  - 仅 textarea
  - 提交调用 POST checkins，body 仅 `{ content }`
- 不显示：
  - “提交证明”
  - 核验未通过提示
  - 申诉入口/申诉提示

### 4.2 创建页（PlanCreate）
“其它场景”输入引导应更轻量：
- 占位与提示强调：一句话目标 + 最小行动
- 不强调证据/核验

---

## 5. Prompt（生成计划内容与 schedule）

当识别为“其它场景”（general/other）时，生成 prompt 需满足：
- 输出更像“清单/习惯/里程碑”，默认每日 1 个最小行动（可勾选完成）
- 每天可选 1 个加分项
- 语言避免“提交证明/核验/证据”

仍要求严格输出 `schedule` JSON（沿用现有校验）。

---

## 6. 验收标准（DoD）

### 6.1 其它（general）打卡
- POST 空 body 成功创建 submission（201）
- POST 仅 content 成功创建 submission（201）
- POST 携带 attachments 被拒绝（400）
- DELETE 可撤销（200），撤销后详情不再视为完成（依赖 closedAt 过滤）
- 全程不出现 422、不出现申诉入口

### 6.2 非 general 不回归
- study 仍要求 content/attachments；仍可能 422；仍可申诉
- travel 保持现状（记录可选/图片优先）

