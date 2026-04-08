export type EvaluationLatencySnapshot = {
  count: number;
  min: number | null;
  max: number | null;
  average: number | null;
};

const evaluationLatencies: number[] = [];

export function recordEvaluationLatency(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) {
    return;
  }

  evaluationLatencies.push(ms);
}

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
