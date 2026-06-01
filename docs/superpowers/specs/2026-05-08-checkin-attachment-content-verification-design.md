## 背景

当前「提交完成证明」核验只接收附件元信息（`url/fileName/kind`），AI/启发式均无法读取附件内容，导致：

- 用户上传不相关图片/文档也可能因“有附件”而误判通过。
- 对“流程图/截图/文档证明”类任务无法做到内容对齐校验。

目标：采用 **方案 A（文本提取 + 对照核验）**，在后端下载并解析附件内容（或提取文本），并把提取结果参与核验。

## 目标与非目标

### 目标

- **内容核验**：支持图片（OCR）、PDF、DOCX、TXT/MD/CSV 的文本提取，并将提取文本参与打卡核验。
- **安全可控**：限制下载来源、文件大小、解析耗时；避免 SSRF 与资源滥用。
- **可回退**：提取失败不阻断，但不会“只因有附件就通过”；仍依赖用户说明对齐。
- **最小侵入**：不改前端提交结构（仍传 `attachments: [{url,fileName,kind}]`），优先后端增强。

### 非目标（本阶段不做）

- 不做“真正看懂流程图结构”的多模态视觉模型（那是方案 B）。
- 不做附件内容长期落库与审计链（方案 C）。

## 核心设计

### 1) 附件内容提取（后端）

在 `createScheduleSlotCheckin` 中，针对每个附件 `url`：

- **仅允许下载本站上传路径**：`/files/<uuid>.<ext>`（由 `upload.routes.ts` 公开读取，文件名不可猜测且格式受限）。
- 通过 `UPLOAD_DIR` 本地文件路径读取（优先）或 HTTP 读取（仅站内 URL），并做 **大小上限** 与 **超时**。

支持类型与提取方式：

- **image（jpg/png/gif/webp）**：OCR（英文优先；可选中英混合），输出 `extractedText`
- **pdf**：文本抽取（取前 N 字并截断）
- **docx**：`mammoth.extractRawText`
- **txt/md/csv**：utf-8 解码（必要时替换非法字符），截断
- 其他类型：不提取（`extractedText = ""`）

提取产物（仅在本次请求内使用）：

- `attachmentExtractedTextCombined`：把每个附件的 `extractedText` 做合并，去噪 + 截断到固定上限（如 2000-4000 字）。
- `attachmentExtractMeta`：用于调试与提示（例如：哪些附件提取失败、提取长度等）。本阶段不对外暴露到前端，仅用于日志（可选）。

### 2) 核验联动（AI + 启发式）

在 `evaluateCheckinSubmission` 增加可选字段：

- `attachmentExtractedText?: string`

启发式规则调整：

- **相关性**：使用 `max(overlap(task, userContent), overlap(task, attachmentExtractedText))`，避免用户文字简短但附件 OCR/文本很清楚时误杀。
- **证据维度**：附件仅加分，不可直接满分；要求最低限度文字说明对齐任务。
- **产物型任务 gate**：当任务文本显式包含“流程图/架构图/diagram/flow/pipeline”等时：
  - 如果用户说明过短且 extractedText 也无法体现关键内容，则不通过；
  - 如果 extractedText 命中关键术语/步骤（例如 RAG、embedding、retriever），可放行。

LLM（DeepSeek）审核提示增强：

- 明确说明“你未看到附件内容，但你将收到 OCR/抽取文本片段作为证据摘要”，并要求模型基于摘要与用户说明对齐判断，不得仅凭“有附件”放行。

### 3) 安全与资源限制（必须）

- **来源限制**：只允许下载 `buildPublicFileUrl` 产出的本站 URL（或同 host 的 `/files/` 路径）。拒绝任意外链，防 SSRF。
- **大小限制**：单附件最大读取（例如 2MB），超过直接标记为提取失败。
- **超时限制**：单附件提取超时（例如 2s），总提取预算（例如 6s），超时则中止并回退。
- **并发限制**：同一提交最多处理 N 个附件（当前上传限制 files=1，但手动链接可多条；对 attachments 也需上限）。

### 4) 失败与回退策略

- 提取失败：仍允许用户提交，但更依赖用户说明；不再出现“只传附件就轻易通过”。
- OCR/解析为空：不额外加分；不会降低现有用户说明的有效性。

## 测试计划（最小覆盖）

- 单测（`checkin-submission-score.test.ts`）：
  - 产物型任务 + “已上传图片” + `attachmentExtractedText` 无命中 → 不通过
  - 同场景但 `attachmentExtractedText` 命中关键术语 → 通过
- 集成测试（`schedule-slot-checkin.test.ts`）：
  - 通过 `/uploads` 上传一个 txt/md 文件（含关键术语），提交打卡时只写简短说明，仍可通过（使用 extractedText 辅助）

## 交付范围（第一期）

- 后端：站内附件下载/本地读取 + 文本提取 + 核验联动
- 前端：不改接口形状；必要时仅优化提示文案（避免“相关图片”的误导）

