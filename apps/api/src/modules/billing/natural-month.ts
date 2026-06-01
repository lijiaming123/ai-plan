/**
 * 自然月续期：起始日为 from 的 UTC 日期，到期为「下月同日 −1 天」23:59:59.999 UTC；
 * 若下月无同日则取该月最后一天再减 1 天。
 */
export function addNaturalMonth(from: Date): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();
  const day = from.getUTCDate();
  const nextM = m + 1;
  const daysInNextMonth = new Date(Date.UTC(y, nextM + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, daysInNextMonth);
  const expiry = new Date(Date.UTC(y, nextM, clampedDay));
  expiry.setUTCDate(expiry.getUTCDate() - 1);
  expiry.setUTCHours(23, 59, 59, 999);
  return expiry;
}

/** 从 from 起算 days 个日历日，到期日为第 days 日 23:59:59.999 UTC（含首日）。 */
export function addCalendarDaysEndUtc(from: Date, days: number): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/** 续费：在现有未过期 proExpiresAt 基础上 +1 自然月，否则从 anchor 起算 1 个月。 */
export function extendProExpiresByOneMonth(
  current: Date | null | undefined,
  anchor: Date = new Date(),
): Date {
  const base =
    current != null && current.getTime() > anchor.getTime() ? current : anchor;
  return addNaturalMonth(base);
}
