import { prisma } from "../../lib/prisma";
import { nextLocalMidnightUtc, getDefaultTimeZone } from "../../lib/reminder-tz";

const DEFAULT_MINUTES = 20 * 60;

function parseHhmm(s: string): { ok: true; minutes: number } | { ok: false; message: string } {
  const t = s.trim();
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(t);
  if (!m) return { ok: false, message: "reminder time must be HH:mm (0–23)" };
  const h = parseInt(m[1]!, 10);
  const min = parseInt(m[2]!, 10);
  return { ok: true, minutes: h * 60 + min };
}

export function minutesToHhmm(m: number) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export async function getOrCreateNotificationSettings(userId: string) {
  const ex = await prisma.userNotificationSettings.findUnique({
    where: { userId },
  });
  if (ex) return ex;
  return prisma.userNotificationSettings.create({
    data: {
      userId,
      timeZone: getDefaultTimeZone(),
      remindAtMinutes: DEFAULT_MINUTES,
    },
  });
}

export async function updateNotificationSettings(input: {
  userId: string;
  reminderTime?: string;
  timeZone?: string;
}): Promise<
  | { ok: false; message: string }
  | {
      ok: true;
      row: {
        remindAtMinutes: number;
        pendingRemindAtMinutes: number | null;
        switchAt: Date | null;
        timeZone: string;
      };
    }
> {
  const tz = input.timeZone?.trim() || getDefaultTimeZone();
  if (input.reminderTime) {
    const p = parseHhmm(input.reminderTime);
    if (!p.ok) return p;
    const existing = await prisma.userNotificationSettings.findUnique({
      where: { userId: input.userId },
    });
    if (!existing) {
      const row = await prisma.userNotificationSettings.create({
        data: {
          userId: input.userId,
          timeZone: tz,
          remindAtMinutes: p.minutes,
        },
      });
      return {
        ok: true,
        row: {
          remindAtMinutes: row.remindAtMinutes,
          pendingRemindAtMinutes: row.pendingRemindAtMinutes,
          switchAt: row.switchAt,
          timeZone: row.timeZone,
        },
      };
    }
    const at = nextLocalMidnightUtc(new Date(), getDefaultTimeZone());
    const row = await prisma.userNotificationSettings.update({
      where: { userId: input.userId },
      data: {
        timeZone: tz,
        pendingRemindAtMinutes: p.minutes,
        switchAt: at,
      },
    });
    return {
      ok: true,
      row: {
        remindAtMinutes: row.remindAtMinutes,
        pendingRemindAtMinutes: row.pendingRemindAtMinutes,
        switchAt: row.switchAt,
        timeZone: row.timeZone,
      },
    };
  }
  if (input.timeZone?.trim()) {
    const row = await prisma.userNotificationSettings.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        timeZone: input.timeZone.trim(),
        remindAtMinutes: DEFAULT_MINUTES,
      },
      update: { timeZone: input.timeZone.trim() },
    });
    return {
      ok: true,
      row: {
        remindAtMinutes: row.remindAtMinutes,
        pendingRemindAtMinutes: row.pendingRemindAtMinutes,
        switchAt: row.switchAt,
        timeZone: row.timeZone,
      },
    };
  }
  return { ok: false, message: "no updatable field" };
}

export async function applyAllPendingSettings(now: Date = new Date()) {
  const rows = await prisma.userNotificationSettings.findMany({
    where: { switchAt: { lte: now }, pendingRemindAtMinutes: { not: null } },
  });
  for (const r of rows) {
    await prisma.userNotificationSettings.update({
      where: { userId: r.userId },
      data: {
        remindAtMinutes: r.pendingRemindAtMinutes!,
        pendingRemindAtMinutes: null,
        switchAt: null,
      },
    });
  }
}

export { parseHhmm, DEFAULT_MINUTES };
