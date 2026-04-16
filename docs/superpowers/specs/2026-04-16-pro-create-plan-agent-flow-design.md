# Pro 创建计划：计划助手 Agent 闭环（生成→评审→优化→确认→生成草稿）

**日期**：2026-04-16  
**版本**：v1（已确认）  
**定价/形态**：Pro 年付 60  
**Pro 核心权益文案**：复盘洞察报 + 计划优化  
**本规格范围**：仅覆盖「创建计划页」的 Pro 计划优化工作流与接口契约；**免费版保留现状不削弱**。  

---

## 1. 背景与目标

### 1.1 背景
当前系统创建计划流程以“一次性生成/提交”为主。Pro 希望提供更高质量、更可执行的计划，并通过“对话式优化”降低用户后期大改成本，同时保持成本可控。

### 1.2 目标（Pro）
- **计划优化**：用户可在创建计划页通过“生成初稿”进入计划助手对话，获取评审/打分/问题与优化建议，并在确认后生成草稿计划。
- **低摩擦**：用户也可直接点“立即生成计划”，由 Agent 自动完成一次“自生成→自优化”闭环后进入草稿页。
- **一致性**：无论路径 A/B，最终进入草稿页时都保证计划正文与打卡表（schedule）一致、可落库、可复现。

### 1.3 非目标（本期不做）
- Pro 专属补充字段（时间预算/验收标准/证据偏好/约束等）**先不做**，作为后续增强项。
- 支付链路接入与订阅表（本规格只定义前端入口与接口契约；权益判定可先走后端开关/白名单策略）。
- 洞察报（周报/月报）功能实现（会在另一份洞察规格中单独定义）。

---

## 2. 用户故事

### US-1：Pro 先生成初稿再对话优化
作为 Pro 用户，我希望点击“生成初稿”后进入计划助手对话，系统能批评并给出评分、问题与选项，我确认优化版本后再点击“立即生成计划”生成草稿页。

### US-2：Pro 直接立即生成计划
作为 Pro 用户，我不想对话，直接点击“立即生成计划”，系统自动生成并优化一版计划，然后进入草稿页。

### US-3：免费版保留现状
作为免费用户，我的创建计划流程与当前一致，不出现强制对话或阻断。

---

## 3. 页面交互与状态机（关键）

### 3.1 页面结构（创建计划页）
- 保留现有普通版表单字段与交互（不改其含义、不删除字段）。
- Pro 用户额外展示“计划助手（Pro）”区域（可为侧栏/抽屉/弹窗/嵌入式对话面板，由前端 UI 决定）。
- 两个按钮（名称可微调，语义固定）：
  - **生成初稿**：进入对话式优化路径（路径 A）
  - **立即生成计划**：生成草稿并跳转草稿页（路径 A 需确认，路径 B 自动闭环）

### 3.2 状态机（必须实现为显式状态，避免实现漂移）

状态枚举：
- `idle`：未生成初稿
- `draft_generating`：生成初稿中
- `draft_ready`：已得到初稿/优化版可展示
- `awaiting_confirmation`：**需要用户确认优化**（路径 A 的关键 gate）
- `final_creating`：生成草稿计划中
- `error`：错误态（展示可恢复操作）

核心数据快照（用于可回退与可测试）：
- `draftOriginal`：初稿（正文 + schedule + meta）
- `draftOptimized`：自动优化版（正文 + schedule + meta）
- `draftConfirmed`：用户确认后的最终版（正文 + schedule + meta）

> Gate 规则（用户已确认）：只有 `draftConfirmed != null` 时，“立即生成计划”可点击（路径 A）。  

### 3.3 路径 A：先点“生成初稿”（对话式）

1) 用户点击“生成初稿”
- 状态：`idle → draft_generating`
- 调用：`POST /plans/assistant`（Pro 模式）

2) 后端返回“初稿 + 评审 + 自动优化版 + 选项”
- 状态：`draft_generating → awaiting_confirmation`
- UI 展示：
  - 初稿/优化版的摘要
  - 评分（总分 + 分维度可选）
  - 问题列表（Top N）
  - 选项（2–4 个）+ “自定义输入框”
  - 明确 CTA：**“使用默认优化版”**（这是确认动作之一）

3) 用户完成“优化确认”（满足其一）
- 选择一个选项并应用（后续会调用 `apply-option`）
- 或点击“使用默认优化版”
- 或输入自定义优化并应用（同样通过 `apply-option`）

确认完成后：
- 进入 `draft_ready`
- `draftConfirmed` 被写入
- “立即生成计划”按钮可点击

4) 用户点击“立即生成计划”
- 状态：`draft_ready → final_creating`
- 调用：`POST /plans`（使用 `draftConfirmed` 的正文 + schedule）
- 成功：跳转草稿页

### 3.4 路径 B：直接点“立即生成计划”（无对话）

1) 用户点击“立即生成计划”
- 状态：`idle → final_creating`
- 系统行为：后端内部自动完成一次闭环（生成→评审→优化）并直接创建草稿

2) 成功后跳转草稿页
- 草稿页可展示本次优化摘要（可选）

---

## 4. 接口契约（最小增量）

### 4.1 生成初稿（Pro 模式，复用现有接口）

**POST** `/plans/assistant`

请求体（在现有 `PlanAssistantBody` 基础上增加开关字段；其余字段保持不变）：
- `tier?: "pro"`
- `agent?: "pro"`

响应体（保持旧字段兼容，并新增 meta）：
- `reply: string`
- `suggestedContent: string`（建议返回“优化版”正文）
- `schedule?: { granularity: "day" | "week"; slots: Array<{ slotKey: string; content: string; ... }> }`
- `meta?: {`
  - `usedAgent: "pro"`
  - `score: number`
  - `scoreBreakdown: { executability: number; clarity: number; riskControl: number; rhythm: number }`
  - `issues: Array<{ code: string; severity: string; title: string; detail: string; suggestion: string }>`
  - `options: Array<{ id: string; title: string; pros: string[]; cons: string[] }>`
  - `diffSummary: string[]`
  - `assumptions: string[]`
`}`

> 兼容性：旧前端只用 `reply/suggestedContent/schedule` 也能正常工作。  

### 4.2 应用选项/自定义优化（新增接口，推荐）

**POST** `/plans/assistant/apply-option`

用途：将“选项选择/自定义输入”转换为一次可复现的优化结果，写入 `draftConfirmed`。

请求体（建议）：
- `baseSuggestedContent: string`
- `baseSchedule: { granularity; slots[] }`
- `optionId?: "more_granular" | "save_time" | "more_steady" | "more_aggressive"`
- `customText?: string`
- `context: { goal; startDate; endDate; cycle; type }`（与创建表单一致）

响应体：
- `suggestedContent: string`
- `schedule: ...`
- `meta?: { diffSummary: string[]; score?: number }`

### 4.3 最终生成草稿（复用现有接口）

**POST** `/plans`

行为：使用 `draftConfirmed` 的正文与 schedule 创建草稿并跳转草稿页。

> schedule 传递方式：可以在 requirement 正文末尾附加严格 ```json``` 块，让后端走 strict 校验与落库（与现有 schedule 解析逻辑一致）。

---

## 5. 权益与开关（实现建议）

本期允许先用后端开关策略（避免阻塞）：
- `PRO_PLAN_AGENT_ENABLED=1`：全员开启（内测）
- `PRO_USER_IDS=...`：白名单用户

后续再接 `Subscription/Entitlements` 正式方案。

---

## 6. 错误态与恢复策略

- `/plans/assistant` 失败：提示“智能服务暂不可用”，并提供“仅用普通模式立即生成计划”的回退按钮（免费/Pro 均可用）。
- `apply-option` 失败：保留当前 `draftOptimized`，允许用户重试或直接选择“使用默认优化版”。
- `POST /plans` 失败：保留 `draftConfirmed`，允许重试，不丢失对话结果。

---

## 7. 验收标准（DoD）

- **路径 A（对话式）**
  - 点击“生成初稿”后必须进入 `awaiting_confirmation`
  - 未确认优化前，“立即生成计划”必须禁用，并有明确提示
  - 完成一次确认后才能点击“立即生成计划”并进入草稿页

- **路径 B（直达）**
  - 未点“生成初稿”直接点“立即生成计划”，系统能自动生成+优化并进入草稿页

- **兼容性**
  - 免费版流程不变，且不被 Pro gate 阻断
  - 老客户端不传 `tier/agent` 时行为与当前一致

- **数据一致性**
  - 进入草稿页后，正文与 schedule 不冲突；schedule slotKey 严格有效

---

## 8. 后续增强（不在本期）

- 增加 Pro 专属补充字段（时间预算/验收/证据/约束）以进一步提升可执行性与评分稳定性
- 周报洞察报（统计分析页 Pro 内容）
- 用户私有 RAG（基于历史计划与打卡数据辅助优化）

