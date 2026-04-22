import { addDays, format, parse } from "date-fns";
import { prisma } from "../../lib/prisma";
import {
  ymdInTimeZone,
  localMinutesSinceMidnight,
  isSundayInTimeZone,
} from "../../lib/reminder-tz";
import type { CheckinSchedule } from "../plans/deepseek-schedule";
import { listScheduleSlotSubmissionsBySlot } from "../plans/schedule-slot-checkin.service";
import { tryCreateCheckinNotification } from "./in-app-notification.service";
import {
  applyAllPendingSettings,
  getOrCreateNotificationSettings,
} from "./user-notification-settings.service";

const WINDOW_MIN = 10;

/**
 * 定时任务：在「有效提醒分钟」起连续 WINDOW_MIN 分钟内，为未打卡的日/周槽各写一条 InApp（dedupe 幂等）。
 */
export async function runCheckinReminderJob(now: Date = new Date()) {
  await applyAllPendingSettings(now);
  const users = await prisma.plan.findMany({
    select: { userId: true },
    distinct: ["userId"],
  });
  for (const { userId } of users) {
    const s = await getOrCreateNotificationSettings(userId);
    const tz = s.timeZone || "Asia/Shanghai";
    const localM = localMinutesSinceMidnight(now, tz);
    const target = s.remindAtMinutes;
    if (localM < target || localM > target + WINDOW_MIN - 1) continue;

    const isSun = isSundayInTimeZone(now, tz);
    const todayYmd = ymdInTimeZone(now, tz);
    const plans = await prisma.plan.findMany({ where: { userId } });

    for (const plan of plans) {
      const version = plan.confirmedVersion ?? plan.currentVersion ?? 1;
      const scheduleRows = (await prisma.$queryRawUnsafe(
        'SELECT schedule FROM "PlanVersion" WHERE "planId" = $1 AND version = $2 LIMIT 1',
        plan.id,
        version,
      )) as Array<{ schedule: unknown | null }>;
      const schedule = scheduleRows[0]?.schedule as CheckinSchedule | null;
      if (!schedule?.slots?.length) continue;

      const subs = await listScheduleSlotSubmissionsBySlot(plan.id, userId);

      if (schedule.granularity === "day") {
        for (const sl of schedule.slots) {
          if (sl.slotKey !== todayYmd) continue;
          if ((subs[sl.slotKey] ?? []).length > 0) continue;
          const dedupe = `checkin:day:${userId}:${plan.id}:${sl.slotKey}:${todayYmd}`;
          await tryCreateCheckinNotification({
            userId,
            type: "checkin_due_day",
            planId: plan.id,
            slotKey: sl.slotKey,
            goal: plan.goal,
            dedupeKey: dedupe,
          });
        }
        continue;
      }

      if (schedule.granularity === "week" && isSun) {
        const n = schedule.slots.length;
        const deadlineYmd = ymdInTimeZone(plan.deadline, tz);
        const endD = parse(deadlineYmd, "yyyy-MM-dd", new Date(0));
        const planStartD = addDays(endD, -(7 * n - 1));
        const planStartYmd = format(planStartD, "yyyy-MM-dd");
        const planStart = parse(planStartYmd, "yyyy-MM-dd", new Date(0));
        for (let i = 0; i < schedule.slots.length; i++) {
          const sl = schedule.slots[i]!;
          const k = i + 1;
          const weekStartD = addDays(planStart, 7 * (k - 1));
          const weekEndD = addDays(weekStartD, 6);
          const wsy = format(weekStartD, "yyyy-MM-dd");
          const wey = format(weekEndD, "yyyy-MM-dd");
          if (todayYmd < wsy || todayYmd > wey) continue;
          if ((subs[sl.slotKey] ?? []).length > 0) continue;
          const dedupe = `checkin:week:${userId}:${plan.id}:${sl.slotKey}:${wsy}`;
          await tryCreateCheckinNotification({
            userId,
            type: "checkin_due_week",
            planId: plan.id,
            slotKey: sl.slotKey,
            goal: plan.goal,
            dedupeKey: dedupe,
          });
        }
      }
    }
  }
}
