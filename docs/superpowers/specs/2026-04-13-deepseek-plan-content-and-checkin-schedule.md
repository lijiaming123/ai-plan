# DeepSeek 计划正文 + 打卡表（按颗粒度）规格（方案1 + B）

## 背景
当前 DeepSeek 返回的是一大段计划正文文本。为了支持「计划详情页按天/按周打卡」与「审核」，需要补齐稳定的结构化数据来源。

约束与目标：
- 用户偏懒：**创建流程尽量少步骤**（不增加上传图片等摩擦）。
- 打卡与审核需要**稳定结构**（可落库、可索引、可回放）。
- DeepSeek 负责**内容生成**，系统负责**结构与约束**（避免模型日期错位、漏周等格式漂移）。

---

## 决策结论（已确认）

### 1) 创建计划页字段调整
- 去掉「输出形式 outputMode」。
- 使用「计划颗粒度 granularityMode」为必填，决定打卡表粒度：
  - `deep`（深度计划）→ 按天（YYYY-MM-DD）
  - `rough`（粗略计划）→ 按周（W1、W2…）
  - `smart`（智能）→ **自动（C）**

### 2) `smart` 自动规则（C）
- 时长 **≤ 3 个月**：推荐/默认按天（等同 deep）
- 时长 **> 3 个月**：推荐/默认按周（等同 rough）

> 说明：`smart` 是推荐策略；最终落库需要写清「实际采用的粒度」，用于回放与一致展示。

### 3) DeepSeek 输出形态：方案1 + B
- **方案1**：系统生成时间槽骨架（slot keys），DeepSeek 只“填内容”。
- **B**：每个时间槽生成 **1 段当期计划正文**（而不是 3–7 条可逐条勾选任务）。

### 4) 与现有 stages/tasks 的关系
- 现有 `PlanVersionSnapshot.stages[].tasks[]` 仍保留，作为“计划结构与任务清单”。
- 新增的 `CheckinSchedule` 用于“按期打卡与审核”的视图与数据源。
- 两者可以并行：
  - stages/tasks 用于展示阶段/任务树
  - schedule 用于执行期（天/周）视图与打卡

---

## 数据结构（建议）

### 术语
- **slot**：一个打卡周期单元（按天或按周）。
- **slotKey**：
  - day：`YYYY-MM-DD`
  - week：`W1`、`W2`…

### 打卡表建议落库形态（高层）
建议新增/扩展一个“执行排程”结构（可挂在 PlanVersionSnapshot 或独立表）：

```ts
type CheckinSchedule = {
  granularity: 'day' | 'week';
  slots: Array<{
    slotKey: string;           // YYYY-MM-DD 或 Wn
    title?: string;            // 可选：例如“第 2 周：基础搭建”
    content: string;           // 方案B：当期计划一段话
    checklist?: string[];      // 预留：未来可升级为逐条任务
  }>;
};
```

约束：
- `slots[].slotKey` 必须与系统生成的骨架一一对应（不可多、不可少）。
- `content` 必填，允许较短（例如 1–3 句），但不得为空。

---

## 用户可编辑（新增需求）

### 目标
允许用户在计划生成后，对某个 day/week 的 `slot.content` 进行手动修改，以满足：
- 对 DeepSeek 生成内容不满意时可自行修订
- 后续打卡/审核以“最终内容”为准

### 编辑模型（建议）
保持“结构不变、内容可覆盖”的思路：
- 系统生成并落库 `slots[].content`（DeepSeek 或 fallback）
- 用户编辑时，仅更新该 slot 的 content，并记录来源与时间

建议将 slot 结构扩展为：

```ts
type CheckinSlot = {
  slotKey: string;
  /** 系统生成（DeepSeek 或 fallback）的原始内容，只读保留用于回溯 */
  generatedContent: string;
  /** 用户最终内容：默认等于 generatedContent；编辑后写入 */
  content: string;
  /** content 来源，用于 UI 展示“已编辑”状态 */
  contentSource: 'generated' | 'edited';
  /** 编辑信息（可选，若需要审计） */
  editedAt?: string;
  editedByUserId?: string;
};
```

### 业务规则
- 编辑只影响当前计划版本对应的 schedule（与版本绑定时）。
- 不允许改动 `slotKey`、不允许增删 slot。
- 若后续“重新生成版本”，新版本的 schedule 以新生成内容为准，旧版本保留原编辑历史。

### UI/交互（建议）
- 每个 slot 提供“编辑”入口：
  - 点击进入弹窗或内联 textarea
  - 保存后立即更新该 slot 的显示内容
- 显示“已编辑”标记（例如小点/文案），并可提供“恢复为生成内容”（将 content 置回 generatedContent）。

---

## 系统生成「时间槽骨架」规则

输入：
- `startDate`、`endDate`（创建计划页已有）
- `granularityMode`（deep/rough/smart）

输出：
- `granularity`：`day` 或 `week`
- `slotKeys[]`：
  - day：从 start 到 end（含两端）逐日生成 `YYYY-MM-DD`
  - week：按跨度天数计算周数 \(ceil(days/7)\)，生成 `W1..Wn`

smart 决策：
- 若 `endDate - startDate` ≤ 92 天（约 3 个月）→ `day`
- 否则 → `week`

> 关键：一旦生成并写入某版本的 schedule，后续展示与打卡必须以该版本为准，不随“今天”变化。

---

## DeepSeek Prompt 协议（强约束输出）

目标：让 DeepSeek 输出两段内容：
1) **正文（可展示）**
2) **JSON（可解析，用于打卡表内容填充）**

### System（新增/替换建议）
在现有 `DEEPSEEK_SYSTEM` 的基础上增加协议要求（示意）：
- 必须输出中文
- 必须在最后输出一个 ` ```json ` code block
- JSON 必须严格符合 schema：`{ schedule: { granularity, slots: [...] } }`
- `slots` 必须只使用系统提供的 slotKey 列表，不得自造日期/周序

### User（建议输入内容）
向 DeepSeek 提供：
- 计划目标、补充说明（requirement）
- 起止日期
- 颗粒度（day/week）
- 系统生成的 slotKey 列表（重要：模型只填内容）

示例（伪）：
```text
目标：{goal}
起止：{startDate} ~ {endDate}
粒度：{day|week}
时间槽：{slotKeys 逐行列出}

请输出：
1) 计划正文（用于展示）
2) JSON（用于打卡表），字段如下：
{
  "schedule": {
    "granularity": "day|week",
    "slots": [
      { "slotKey": "...", "content": "..." }
    ]
  }
}
注意：slotKey 必须严格来自“时间槽”列表，顺序保持一致。
```

---

## 解析、校验与降级策略（必须）

### 解析步骤
1. 从 DeepSeek 返回文本中提取最后一个 ` ```json ... ``` ` 代码块。
2. JSON.parse → 得到 schedule。
3. 校验：
   - `granularity` 与系统期望一致
   - `slots.length` 与 slotKeys 长度一致
   - `slots[i].slotKey === slotKeys[i]`（严格一一对应）
   - `content.trim().length > 0`

### 降级
任一环节失败：
- 仍保存 DeepSeek 正文（用户可读）
- schedule 走“系统兜底”：为每个 slotKey 生成一段默认内容，例如：
  - day：`今日重点：围绕目标推进 1 个可验证动作。完成后记录证据。`
  - week：`本周目标：完成 1 个里程碑 + 复盘 1 次。`
- 记录告警日志（便于观察模型稳定性与 prompt 迭代）。

### 安全与长度限制（建议）
- 在发送给 DeepSeek 前，对 slotKeys 数量做上限保护：
  - day：最大 93 天（≈ 3 个月）；超过则提示用户改为 rough/week（或在 smart 规则下自动落到 week）
  - week：最大 52 周（≈ 1 年）；超过提示拆分计划
- 对 DeepSeek 返回的 JSON `content` 做长度限制（例如每 slot ≤ 600 字），超出则截断并记录日志。

---

## 前端展示建议（非实现）

### 计划详情页
- 顶部：正文（DeepSeek 生成的计划说明）
- 下方：打卡表
  - deep/day：按日期分组的卡片/列表，每个 slot 一段内容 + 打卡按钮
  - rough/week：按周分组，每周一段内容 + 打卡按钮

> 方案B 的 slot 是“一段文本”，打卡粒度为 slot（天/周）。未来升级到 checklist 时可向下兼容。

---

## 验收标准（DoD）
- 创建计划时不再出现「输出形式 outputMode」字段。
- granularityMode 为必填，且能决定 schedule 的实际粒度：
  - deep → day
  - rough → week
  - smart → 按规则自动
- DeepSeek 返回的正文可展示；JSON 可被稳定解析并生成 schedule。
- 解析失败时系统可降级生成 schedule，页面仍可打卡，不阻塞主流程。
- 用户可对任意 slot 的内容进行编辑并保存；保存后详情页与打卡/审核使用用户最终 content。
- 支持“恢复为生成内容”（可选但推荐），并能显示该 slot 是否被编辑过。

