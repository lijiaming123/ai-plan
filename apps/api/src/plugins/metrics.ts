/**
 * 进程内指标（非 Prometheus）：仅收集「提交自动评判」单次耗时毫秒数。
 *
 * 限制：数组无限增长，长时间运行进程可改为环形缓冲或分桶；重启后统计清空。
 * 若管理端要展示，需在路由中调用 getEvaluationLatencySnapshot 并自行暴露接口（当前未接 admin 路由示例）。
 */
export type EvaluationLatencySnapshot = {
  /** 样本条数 */
  count: number;
  min: number | null;
  max: number | null;
  average: number | null;
};

const evaluationLatencies: number[] = [];

/** 记录一次评判耗时；非法或非有限数字直接忽略 */
export function recordEvaluationLatency(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) {
    return;
  }

  evaluationLatencies.push(ms);
}

/** 返回当前进程内累计的 min/max/avg；无样本时各聚合为 null */
export function getEvaluationLatencySnapshot(): EvaluationLatencySnapshot {
  if (evaluationLatencies.length === 0) {
    return { count: 0, min: null, max: null, average: null };
  }

  const total = evaluationLatencies.reduce((sum, value) => sum + value, 0);
  return {
    count: evaluationLatencies.length,
    min: Math.min(...evaluationLatencies),
    max: Math.max(...evaluationLatencies),
    average: total / evaluationLatencies.length,
  };
}
