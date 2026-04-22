/**
 * 打卡提醒用：默认 Asia/Shanghai；与 date-fns 搭配做「自然日 +1」和次日 0:00 切换时刻。
 */
import { addDays, parse, format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

const DEFAULT_TZ = "Asia/Shanghai";

export function getDefaultTimeZone() {
  return DEFAULT_TZ;
}

/** 某时刻在时区下的 yyyy-MM-dd */
export function ymdInTimeZone(d: Date, timeZone: string) {
  return formatInTimeZone(d, timeZone, "yyyy-MM-dd");
}

/** 下一自然日 00:00 的 UTC 时刻（用于用户改提醒点「次日生效」） */
export function nextLocalMidnightUtc(
  from: Date = new Date(),
  timeZone: string = DEFAULT_TZ,
): Date {
  const ymd = ymdInTimeZone(from, timeZone);
  const nextYmd = format(
    addDays(parse(ymd, "yyyy-MM-dd", new Date(0)), 1),
    "yyyy-MM-dd",
  );
  if (timeZone === "Asia/Shanghai") {
    return new Date(`${nextYmd}T00:00:00+08:00`);
  }
  return new Date(`${nextYmd}T00:00:00+08:00`);
}

/** 本地 0:00 起的分钟数 0..1439 */
export function localMinutesSinceMidnight(d: Date, timeZone: string): number {
  const t = formatInTimeZone(d, timeZone, "HH:mm");
  const [h, m] = t.split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function isSundayInTimeZone(d: Date, timeZone: string): boolean {
  return (
    new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(d) ===
    "Sun"
  );
}

/** 判 date 的日历日（无时区）是否在 [a,b] 闭区间（只比较日期，忽略时） */
export { parse, addDays };
