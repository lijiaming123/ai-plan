import { type ComputedRef } from "vue";
import { todayKeyLocal, toLocalDateOnly } from "../../../../lib/plan-dates";

type CheckinSchedule = {
  granularity?: string;
  meta?: { startDate?: string };
  slots?: unknown[];
} | null;

export function usePlanScheduleSlots(
  checkinSchedule: ComputedRef<CheckinSchedule>,
) {
  function currentWeekSlotKeyOrNull(): string | null {
    const schedule = checkinSchedule.value;
    if (!schedule || schedule.granularity !== "week") return null;
    const meta = schedule.meta;
    if (!meta?.startDate) return null;
    const start = toLocalDateOnly(meta.startDate);
    if (!start) return null;
    const today = toLocalDateOnly(todayKeyLocal());
    if (!today) return null;
    const diffDays = Math.floor(
      (today.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
    );
    const weekNo = diffDays >= 0 ? Math.floor(diffDays / 7) + 1 : 1;
    return `W${weekNo}`;
  }

  function isCurrentSlot(slotKey: string): boolean {
    if (/^\d{4}-\d{2}-\d{2}$/.test(slotKey)) return slotKey === todayKeyLocal();
    if (/^W\d+$/.test(slotKey)) return slotKey === currentWeekSlotKeyOrNull();
    return false;
  }

  function scheduleRowClass(slotKey: string): string {
    if (!isCurrentSlot(slotKey)) return "";
    return "bg-emerald-50/50";
  }

  function scheduleRowLeftMarkClass(slotKey: string): string {
    if (!isCurrentSlot(slotKey)) return "";
    return "border-l-4 border-l-emerald-400";
  }

  return {
    isCurrentSlot,
    scheduleRowClass,
    scheduleRowLeftMarkClass,
  };
}
