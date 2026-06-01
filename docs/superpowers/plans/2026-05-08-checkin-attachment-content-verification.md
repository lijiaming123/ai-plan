# Check-in Attachment Content Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在「提交完成证明」核验中，后端下载并解析本站附件（图片 OCR + 文档抽取），把提取文本参与核验，显著降低“无关附件也通过”的误判。

**Architecture:** 在 `createScheduleSlotCheckin` 内对 `attachments[].url` 做“仅本站 /files”白名单校验后读取文件（优先本地磁盘路径），按类型提取文本（OCR / pdf / docx / txt），合并后传给 `evaluateCheckinSubmission`。启发式与 LLM prompt 都使用提取文本做对照判断，并加大小/超时/截断限制。

**Tech Stack:** Fastify, Node.js (fetch/fs), Mammoth (docx), 新增 pdf-parse, tesseract.js（OCR）, Vitest

---

### Task 1: 新增附件内容提取模块（安全限制 + 截断）

**Files:**
- Create: `apps/api/src/modules/uploads/attachment-extract.service.ts`
- Modify: `apps/api/src/modules/plans/schedule-slot-checkin.service.ts`
- Test: `apps/api/tests/attachment-extract.test.ts`

- [ ] **Step 1: 写失败测试（仅允许解析 /files；超出大小拒绝）**

在 `apps/api/tests/attachment-extract.test.ts` 新建用例：

```ts
import { describe, expect, it } from "vitest";
import { extractTextFromAttachmentUrl } from "../src/modules/uploads/attachment-extract.service";

describe("attachment-extract", () => {
  it("外链 URL 应被拒绝", async () => {
    const res = await extractTextFromAttachmentUrl({
      url: "http://evil.example/a.png",
      timeoutMs: 500,
      maxBytes: 1024,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("disallowed_url");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

`cd apps/api; corepack pnpm vitest run -c vitest.config.ts tests/attachment-extract.test.ts`

Expected: FAIL（模块未实现 / 导入失败）

- [ ] **Step 3: 实现 `extractTextFromAttachmentUrl`（仅 /files，优先本地读取）**

在 `apps/api/src/modules/uploads/attachment-extract.service.ts` 实现：

```ts
export type AttachmentExtractResult =
  | { ok: true; text: string; kind: "image" | "document" | "other"; mime?: string }
  | { ok: false; reason: "disallowed_url" | "fetch_failed" | "too_large" | "timeout" | "unsupported" | "extract_failed" };

export async function extractTextFromAttachmentUrl(params: {
  url: string;
  timeoutMs: number;
  maxBytes: number;
}): Promise<AttachmentExtractResult> { /* ... */ }
```

约束：
- 只允许 `url` 为相对路径 `/files/<name>` 或同 host 的 `/files/<name>`（`new URL()` 解析后 path 必须以 `/files/` 开头）
- 解析 `name` 并复用 `STORED_FILE_RE` 校验格式
- 用 `getUploadRoot()` 拼成本地文件路径，若存在则 `fs.readFile` 并做 `maxBytes` 限制；否则再用 `fetch` 下载（仅同 host）
- 根据扩展名 / content-type 选择解析器：
  - `.txt/.md/.csv`：utf-8 decode
  - `.docx`：mammoth raw text
  - `.pdf`：pdf-parse
  - `.jpg/.png/.gif/.webp`：tesseract.js（lang=eng，输入 Buffer）
- 结果统一 `text.replace(/\s+/g," ").trim()` 并截断到上限（例如 2000）

- [ ] **Step 4: 运行测试确认通过**

Run:

`cd apps/api; corepack pnpm vitest run -c vitest.config.ts tests/attachment-extract.test.ts`

Expected: PASS

- [ ] **Step 5: 扩展 `createScheduleSlotCheckin` 调用提取并合并文本**

在 `apps/api/src/modules/plans/schedule-slot-checkin.service.ts`：
- 对 `normalizedUrls` 做最多 N 条（如 5）限制
- 逐条调用 `extractTextFromAttachmentUrl`（单条 2s、总 6s 预算）
- 合并为 `attachmentExtractedText`（合并后再截断，例如 3000）
- 调用 `evaluateCheckinSubmission` 时传入 `attachmentExtractedText`

- [ ] **Step 6: 跑现有打卡相关测试**

Run:

`cd apps/api; corepack pnpm vitest run -c vitest.config.ts tests/schedule-slot-checkin.test.ts`

Expected: PASS

---

### Task 2: 核验器接入 extractedText（启发式 + LLM prompt）

**Files:**
- Modify: `apps/api/src/modules/plans/checkin-submission-score.service.ts`
- Test: `apps/api/tests/checkin-submission-score.test.ts`

- [ ] **Step 1: 写失败测试（抽取文本命中关键词可辅助通过）**

在 `apps/api/tests/checkin-submission-score.test.ts` 增加：

```ts
it("要求流程图时：附件抽取文本命中关键术语可通过", async () => {
  const task = "阅读RAG入门文章，并绘制RAG流程图。";
  const { pass } = await evaluateCheckinSubmission({
    slot: slot(task),
    userContent: "见附件",
    attachmentCount: 1,
    attachmentExtractedText: "RAG pipeline: chunking -> embedding -> retriever -> generator",
  });
  expect(pass).toBe(true);
});
```

- [ ] **Step 2: 运行该测试确认失败**

Run:

`cd apps/api; corepack pnpm vitest run -c vitest.config.ts tests/checkin-submission-score.test.ts`

Expected: FAIL（未使用 extractedText）

- [ ] **Step 3: 修改 `evaluateCheckinSubmissionHeuristic` 使用 extractedText**

实现：
- 相关性使用 `max(overlap(task,user), overlap(task,extracted))`
- 产物型 gate 判断时也参考 extractedText 的命中情况（若 extractedText 命中明显，则不触发压低）

并在 DeepSeek prompt 中新增字段说明（“以下为附件 OCR/抽取文本摘要”）。

- [ ] **Step 4: 运行测试确认通过**

Run:

`cd apps/api; corepack pnpm vitest run -c vitest.config.ts tests/checkin-submission-score.test.ts`

Expected: PASS

---

### Task 3: 依赖与类型检查 + 回归测试

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/modules/plans/schedule-slot-checkin.service.ts`（类型变更）

- [ ] **Step 1: 添加依赖**

在 `apps/api/package.json` 增加：
- `pdf-parse`
- `tesseract.js`

- [ ] **Step 2: 安装依赖**

Run:

`cd ai-plan; corepack pnpm -C apps/api add pdf-parse tesseract.js`

Expected: 安装成功

- [ ] **Step 3: 运行 typecheck**

Run:

`cd apps/api; corepack pnpm typecheck`

Expected: PASS

- [ ] **Step 4: 运行关键测试集**

Run:

`cd apps/api; corepack pnpm test`

Expected: PASS

