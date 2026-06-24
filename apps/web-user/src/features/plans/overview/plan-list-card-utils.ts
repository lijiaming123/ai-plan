import type { CheckinListSegment } from "../../../lib/api-client";
import type { PlanCard, PlanStatus } from "./plan-list-types";

export const TITLE_COLOR_CLASSES = [
  "text-slate-800",
  "text-sky-700",
  "text-indigo-700",
  "text-violet-700",
  "text-blue-700",
  "text-teal-700",
  "text-orange-700",
  "text-rose-700",
  "text-amber-800",
] as const;

export const TYPE_TO_TITLE_COLOR: Record<
  string,
  (typeof TITLE_COLOR_CLASSES)[number]
> = {
  general: "text-slate-800",
  study: "text-sky-700",
  travel: "text-teal-700",
  work: "text-indigo-700",
  exam: "text-violet-700",
  fitness: "text-orange-700",
  other: "text-amber-800",
};

function hashToIndex(input: string, mod: number) {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return Math.abs(h) % mod;
}

export function titleColorClass(plan: Pick<PlanCard, "id" | "type">) {
  const key = String(plan.type ?? "")
    .trim()
    .toLowerCase();
  const byType = TYPE_TO_TITLE_COLOR[key];
  if (byType) return byType;
  return TITLE_COLOR_CLASSES[hashToIndex(plan.id, TITLE_COLOR_CLASSES.length)];
}

export function ringStyle(
  plan: Pick<PlanCard, "progress" | "status" | "todayMissing" | "deadline">,
) {
  const pct = Math.max(0, Math.min(100, plan.progress));
  const done = plan.status === "已完成";
  const inProgress = plan.status === "执行中";
  const dd = daysDiffFromToday(plan.deadline);
  const overdueActive = inProgress && dd !== null && dd < 0;
  const todayNudge =
    inProgress && plan.todayMissing === true && !overdueActive;

  let main: string;
  let muted: string;
  if (done) {
    main = "rgba(16, 185, 129, 0.95)";
    muted = "rgba(16, 185, 129, 0.14)";
  } else if (overdueActive) {
    main = "rgba(244, 63, 94, 0.95)";
    muted = "rgba(244, 63, 94, 0.16)";
  } else if (todayNudge) {
    main = "rgba(245, 158, 11, 0.92)";
    muted = "rgba(245, 158, 11, 0.2)";
  } else {
    main = "rgba(16, 185, 129, 0.95)";
    muted = "rgba(16, 185, 129, 0.14)";
  }
  return {
    "--p": `${pct}`,
    "--ring-main": main,
    "--ring-muted": muted,
  } as Record<string, string>;
}

export function segmentRingStyle(
  segments: CheckinListSegment[],
): Record<string, string> {
  const n = segments.length;
  const colorFor = (s: CheckinListSegment) => {
    if (s === "done") return "rgba(16, 185, 129, 0.95)";
    if (s === "missed") return "rgba(244, 63, 94, 0.9)";
    return "rgba(229, 231, 235, 0.35)";
  };
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 100;
    const a1 = ((i + 1) / n) * 100;
    parts.push(`${colorFor(segments[i]!)} ${a0}% ${a1}%`);
  }
  return {
    "--ring-segments": `conic-gradient(from 210deg, ${parts.join(", ")})`,
  };
}

export function ringWrapStyle(plan: PlanCard) {
  if (plan.checkinSegments?.length) {
    return segmentRingStyle(plan.checkinSegments);
  }
  return ringStyle(plan);
}

export function statusClass(status: PlanStatus) {
  if (status === "执行中") {
    return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80";
  }
  if (status === "已完成") {
    return "bg-teal-50 text-teal-900 ring-1 ring-teal-200/70";
  }
  return "bg-stone-100 text-stone-600 ring-1 ring-stone-200/80";
}

export function coverTheme(status: PlanStatus) {
  if (status === "执行中") return "cover--active";
  if (status === "已完成") return "cover--done";
  return "cover--idle";
}

export function fmtDeadline(deadline: string): string {
  const m = deadline.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return deadline;
  return `${m[2]}-${m[3]}`;
}

export function daysDiffFromToday(deadline: string): number | null {
  const d = new Date(`${deadline}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const ms = target.getTime() - today.getTime();
  return Math.round(ms / 86400000);
}

export function dueText(deadline: string): string {
  return `截止 ${fmtDeadline(deadline)}`;
}

export function relativeText(deadline: string): string {
  const dd = daysDiffFromToday(deadline);
  if (dd === null) return "";
  if (dd > 0) return `还剩 ${dd} 天`;
  if (dd < 0) return `已逾期 ${Math.abs(dd)} 天`;
  return "今天截止";
}

export function deadlineRelativeText(plan: PlanCard): string {
  if (plan.status === "已完成") return "";
  return relativeText(plan.deadline);
}

export function isOverdueRelativeText(text: string): boolean {
  return text.startsWith("已逾期");
}
