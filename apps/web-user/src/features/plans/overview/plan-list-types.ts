import type { CheckinListSegment } from "../../../lib/api-client";

export type PlanStatus = "执行中" | "已完成" | "未开始";
export type FilterType = "全部" | "执行中" | "已完成" | "未开始";
export type StatusQuery = "in_progress" | "completed" | "not_started";

export type PlanCard = {
  id: string;
  title: string;
  description: string;
  coverLine: string;
  deadline: string;
  progress: number;
  status: PlanStatus;
  type: string;
  image: string;
  todayMissing?: boolean;
  checkinSegments?: CheckinListSegment[];
};

export const PLAN_FILTERS: FilterType[] = ["全部", "执行中", "已完成", "未开始"];
