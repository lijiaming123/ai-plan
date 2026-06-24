/** 计划相关日期工具（Create / Detail / Settings 共用） */

export function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseLocalDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

export function addDaysYmd(base: string, days: number): string {
  const date = parseLocalDate(base);
  date.setDate(date.getDate() + days);
  return formatYmd(date);
}

export type PlanCycleValue = "1w" | "1m" | "3m" | "6m" | "custom";

export function addMonthsYmd(base: string, months: number): string {
  const date = parseLocalDate(base);
  date.setMonth(date.getMonth() + months);
  return formatYmd(date);
}

export function computeDeadlineByCycle(
  startDate: string,
  cycle: PlanCycleValue,
): string {
  if (cycle === "1w") return addDaysYmd(startDate, 7);
  if (cycle === "1m") return addMonthsYmd(startDate, 1);
  if (cycle === "3m") return addMonthsYmd(startDate, 3);
  if (cycle === "6m") return addMonthsYmd(startDate, 6);
  return "";
}

export function toIsoStartOfDay(dateStr: string): string {
  return `${dateStr}T00:00:00.000Z`;
}

export function calcDurationDays(startDate: string, endDate: string): number {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  const diff = end.getTime() - start.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, days);
}

export function todayKeyLocal(): string {
  return formatYmd(new Date());
}

export function toLocalDateOnly(s: string): Date | null {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return null;
  const d = new Date(`${dateOnly}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 详情页截止日展示 */
export function formatDetailDeadline(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatExpiresDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleDateString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return "";
  }
}

export function daysUntilExpires(iso: string): number {
  try {
    const end = new Date(iso).getTime();
    if (!Number.isFinite(end)) return 0;
    return Math.max(0, Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000)));
  } catch {
    return 0;
  }
}
