import { describe, expect, it } from "vitest";
import {
  addCalendarDaysEndUtc,
  addNaturalMonth,
  extendProExpiresByOneMonth,
} from "../src/modules/billing/natural-month";

describe("addNaturalMonth", () => {
  it("3月15日开通应到期4月14日 23:59:59 UTC", () => {
    const from = new Date("2026-03-15T10:00:00.000Z");
    const exp = addNaturalMonth(from);
    expect(exp.toISOString()).toBe("2026-04-14T23:59:59.999Z");
  });

  it("1月31日开通应落到2月27/28日前一天", () => {
    const from = new Date("2025-01-31T08:00:00.000Z");
    const exp = addNaturalMonth(from);
    expect(exp.getUTCFullYear()).toBe(2025);
    expect(exp.getUTCMonth()).toBe(1);
    expect(exp.getUTCDate()).toBe(27);
    expect(exp.getUTCHours()).toBe(23);
  });

  it("闰年1月31日", () => {
    const from = new Date("2024-01-31T08:00:00.000Z");
    const exp = addNaturalMonth(from);
    expect(exp.getUTCMonth()).toBe(1);
    expect(exp.getUTCDate()).toBe(28);
  });
});

describe("extendProExpiresByOneMonth", () => {
  it("无现有到期应从 anchor 起算", () => {
    const anchor = new Date("2026-05-10T12:00:00.000Z");
    const exp = extendProExpiresByOneMonth(null, anchor);
    expect(exp.toISOString()).toBe("2026-06-09T23:59:59.999Z");
  });
});

describe("addCalendarDaysEndUtc", () => {
  it("7 天试用含首日", () => {
    const from = new Date("2026-05-01T00:00:00.000Z");
    const exp = addCalendarDaysEndUtc(from, 7);
    expect(exp.toISOString()).toBe("2026-05-08T23:59:59.999Z");
  });
});
