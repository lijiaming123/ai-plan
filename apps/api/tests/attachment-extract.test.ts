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
    if (res.ok) throw new Error("unreachable");
    expect(res.reason).toBe("disallowed_url");
  });
});

