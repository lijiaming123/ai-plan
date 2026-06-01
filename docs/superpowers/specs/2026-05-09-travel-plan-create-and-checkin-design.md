# 旅游类型计划：创建表单（P1）与打卡逻辑（勾选完成 + 可选记录）

**日期**：2026-05-09  
**版本**：v1（待确认）  
**范围**：仅覆盖 `type=travel` 的创建计划表单与计划详情页打卡交互/后端规则分流；不影响 `study/work/general` 现有链路。  

---

## 1. 背景与目标

### 1.1 背景
当前系统打卡链路以“提交完成证明 → AI 核验 → 申诉”作为默认模式，适用于学习/训练等强执行场景，但对旅游（记录型、体验型）会造成摩擦：用户只想“我今天完成了行程”并可选地上传照片留存，不希望被强制提交证明或出现未通过/申诉态。

### 1.2 目标
- **旅游打卡主动作轻量化**：以“勾选完成”为默认打卡，不强制文字、不强制附件。
- **旅游记录可选**：附件/文字是“旅行记录”，用于回忆/沉淀，而非核验。
- **不引入强核验**：旅游类型不触发 AI 核验、不产生 422 未通过、不需要申诉入口。
- **创建页更像行程规划**：旅游场景下表单字段与占位文案调整为“出发地/目的地/同行人/风格/预算/交通”等，提升输入质量并改善生成结果。

### 1.3 非目标
- 不做“挑战赛/返现/权益兑换”等强核验玩法（用户明确不会出现）。
- 不做新的旅游专用数据表；优先复用现有 `/plans` 与 `/checkins` 数据结构，控制改动面。

---

## 2. 术语与关键约束

- **旅游计划**：`Plan.type === "travel"`
- **slot**：打卡时间槽（默认按天），`slotKey` 例 `YYYY-MM-DD`
- **submission**：打卡提交记录（PlanScheduleSlotSubmission），在旅游场景中语义为“完成/记录”，不再是“证明”。
- **撤销**：旅游打卡需支持撤销完成（用户要求）。

---

## 3. 用户体验设计（旅游类型）

### 3.1 计划详情页（旅游）

每个 slot 行提供两个动作：
- **主按钮：打卡（勾选完成）**
  - 首次点击：标记为完成（创建一条 submission，内容可为空）
  - 再次点击：撤销完成（将该 slot 的完成标记取消）
  - 不弹“完成证明”抽屉、不触发核验与申诉
- **次级按钮：添加记录（可选）**
  - 打开记录抽屉（复用现有上传能力）
  - 支持：文字（可选）+ 图片/附件（可选）
  - 上限沿用现有：最多 12 个文件、单文件 15MB、类型白名单不变

展示规则：
- slot 行状态列显示：未完成 / 已完成
- “核验结果/申诉状态”在旅游类型隐藏（或不渲染）

### 3.2 旅游记录抽屉文案
- 标题从“完成证明”改为“旅行记录”
- 提示文案强调可选：照片用于留存；不影响完成状态

---

## 4. 后端行为与接口设计

### 4.1 复用接口：POST 创建/更新打卡
继续使用现有接口：
- `POST /plans/:id/schedule/slots/:slotKey/checkins`
- Header：仍支持 `Idempotency-Key`（已实现）

对 `type=travel` 做逻辑分流：

#### 4.1.1 勾选完成（无内容/无附件）
当请求体满足：
- `content` 为空/缺失
- `attachments` 为空/缺失

则视为“勾选完成”：
- **不做 AI 核验**（不调用 evaluateCheckinSubmission）
- 创建 submission（允许空 content，允许 0 附件）
- `status` 取现有值 `submitted`（不新增状态，避免全链路改动）
- 返回 201 与 submission（保持接口一致）

#### 4.1.2 添加记录（有内容或附件）
当请求体存在任意：
- `content` 非空
- 或 `attachments.length > 0`

则视为“旅行记录”：
- **不做 AI 核验**
- 创建 submission，保存 content/attachments（attachments 按现有存 URL）
- 返回 201

> 注：旅游场景 submission 的意义是“完成/记录”，仍可被用于统计、历史回看、跨端同步；附件引用标记（UploadedFile）继续按现有逻辑生效。

### 4.2 新增接口：撤销完成（旅游）
为满足“再次点击撤销完成”的交互，新增最小接口：
- **DELETE** `/plans/:id/schedule/slots/:slotKey/checkins`
- Auth：user
- 行为：关闭/删除该 slot 的“最新一条”submission（详见 4.3）
- 返回：`{ ok: true }`

### 4.3 数据层规则（撤销的实现策略）
建议实现为“软关闭”而非物理删除，降低审计/回滚成本：
- 在 `PlanScheduleSlotSubmission` 增加 `closedAt DateTime?`（新增字段与迁移）
- 列表/详情计算“完成”时，只统计 `closedAt is null` 的 submissions
- DELETE 撤销：对该 planId/userId/slotKey 的最新一条 `closedAt is null` 更新为 `closedAt=now`

如果本期不想改表结构，也可退化为物理删除（deleteMany take newest），但不推荐。

---

## 5. 创建计划页（旅游场景，P1）

### 5.1 表单信息结构（P1）

旅游场景的“更多选项”不再以学习/训练字段为主，而改为旅行规划字段（P1 直接做到位）：

#### 必填
- **出发地**：城市（string）
- **目的地**：城市（string，允许多个用分隔符）
- **开始日期**（startDate）
- **结束日期**（endDate = 行程结束日期）
- **这次旅行想实现什么？**（goal/planName）

#### 选填（P1）
- **同行人**：独自/情侣/朋友/亲子/带老人（enum）
- **旅行风格**：松弛/特种兵/文化博物馆/美食/摄影/自然徒步/购物（multi-select 或 tags）
- **预算**：经济/舒适/高端（enum）或数值区间（本期用 enum）
- **交通偏好**：飞机/高铁/自驾/公共交通优先（multi-select）
- **约束与偏好（可选）**：自由文本（忌口、必去、避雷、住宿区域、每日最晚回酒店时间等）

### 5.2 与现有 `/plans` contract 的映射策略（兼容优先）

服务端 `POST /plans` 目前要求：
- `goal`、`requirement`、`deadline`、`type`
- 以及可选 `profile.basicInfo`（其中 `currentLevel/timeInvestment/outputMode` 等字段为 required）

为避免对现有 contract 做破坏性调整，本期采用“**旅游场景隐藏学习字段但自动填默认值**”策略：

- `profile.basicInfo.planName`：= 旅游目标（必填）
- `profile.basicInfo.planContent`：= 由旅游字段拼装成一段结构化文本（见 5.3）
- `profile.basicInfo.startDate`：= 开始日期
- `profile.basicInfo.endDate`：= 结束日期
- `deadline`：= `endDate` 的 `00:00:00.000Z`（与现有一致）
- `currentLevel`：旅游隐藏，默认 `none`
- `timeInvestment`：旅游隐藏，默认一个固定值（例如 `none` 或现有最宽松选项）
- `outputMode`：旅游隐藏，固定 `daily`
- `cycle`：旅游隐藏，固定 `custom`（由 start/end 控制）
- `granularityMode`：旅游隐藏，固定 `deep`（按天）

> 后续若要更彻底的模型分离，可在 API contract 引入 `profile.travelInfo` 并放宽 `basicInfo` 校验，但不作为本期范围。

### 5.3 requirement（拼装文案）的建议格式

在创建时将旅游字段拼装为一个稳定模板，提升模型可控性：

```
【旅行类型】旅游
【出发地】{from}
【目的地】{to}
【日期】{startDate} - {endDate}（共 {n} 天）
【同行人】{companions}
【风格偏好】{styles}
【预算】{budget}
【交通偏好】{transport}
【约束与偏好】{constraints}
```

并在末尾附用户的自由补充（若有）。

---

## 6. 旅游 prompt（生成 schedule 内容）

目标：让 slot 更像“行程编排/攻略”，而不是“任务清单”。

对旅游类型的生成要求（无论基础生成还是 Pro 助手优化）：
- 每个 slot 建议包含：
  - **路线顺序**（早/午/晚）
  - **交通方式与通勤时长估计**
  - **预约/门票/营业时间提醒**
  - **备选方案**（下雨/人多/体力不足）
  - **可选记录建议**（拍照点/一句话记录建议）

实现方式（建议）：
- 在后端根据 `type=travel` 选择不同 system prompt 模板（或在已有 prompt 中插入旅游专用段落）
- 生成的 schedule 仍遵守现有 JSON 结构：`{ granularity, slots: [{ slotKey, content }] }`

---

## 7. 埋点与可观测性（最小）

新增/调整事件（建议）：
- `travel_checkin_toggle_on`
- `travel_checkin_toggle_off`
- `travel_record_open`
- `travel_record_submit`

后端日志（已有即可）：
- `upload-gc` 定时任务日志不变

---

## 8. 验收标准（DoD）

### 8.1 旅游详情页
- 点击“打卡（勾选）”无需填写内容即可成功完成
- 再次点击可撤销完成
- “添加记录”可上传照片/写文字（不强制），提交成功后 slot 仍显示已完成
- 旅游类型不出现 422 未通过，不展示申诉入口

### 8.2 非旅游类型不回归
- 学习/通用打卡保持现有校验、核验、申诉逻辑不变

### 8.3 创建页（旅游场景 P1）
- 展示并提交：出发地/目的地/日期范围/同行人/风格/预算/交通/约束
- 隐藏学习字段，但请求仍满足服务端校验（通过默认值填充）
- 生成结果的 slot 内容呈现旅行行程语义（路线/交通/提醒/备选/记录建议）

