/** 计划类型 / 状态文案映射 */

const PLAN_TYPE_LABELS: Record<string, string> = {
  general: "通用",
  study: "学习",
  travel: "旅游",
  work: "工作",
  exam: "考试",
  fitness: "运动",
  other: "其它",
};

export function planTypeLabel(type: string | undefined | null): string {
  const t = (type ?? "general").toLowerCase();
  return PLAN_TYPE_LABELS[t] ?? type ?? "";
}

export function planStatusLabel(params: {
  status?: string | null;
  isArchived?: boolean;
  isCompleted?: boolean;
}): string {
  if (params.isArchived) return "已归档";
  if (params.isCompleted) return "已完成";
  const s = params.status;
  if (s === "active") return "执行中";
  if (s === "draft") return "草稿";
  return s ?? "";
}
