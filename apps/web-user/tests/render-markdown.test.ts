import { describe, expect, it } from "vitest";
import { renderMarkdownToHtml } from "../src/lib/render-markdown";

describe("renderMarkdownToHtml", () => {
  it("应渲染表格并保留单元格内的 br 换行", () => {
    const html = renderMarkdownToHtml(`
| 日期 | 任务内容 | 备注 |
|------|----------|------|
| Day 1 | 读文档<br>画架构图 | 重点理解 |
| Day 2 | 跑示例<br/>记录参数<br />整理笔记 | 跑通 Demo |
`);

    expect(html).toContain("<table>");
    expect(html).toContain("<td>Day 1</td>");
    expect(html).toContain("读文档<br>");
    expect(html).toContain("跑示例<br>");
    expect(html).toContain("记录参数<br>");
  });
});
