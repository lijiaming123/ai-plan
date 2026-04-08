# Metrics

This repository uses a minimal first-pass metrics hook for AI evaluation latency.

## What is recorded

- `evaluationLatencyMs`: time spent inside `evaluateSubmission()`
- Snapshot fields:
  - `count`
  - `min`
  - `max`
  - `average`

## Current scope

- Metrics are kept in memory for the first release.
- There is no external metrics backend wired in yet.
- The hook is intentionally lightweight so it can be replaced later by Prometheus or another collector.

## Usage

- Call `recordEvaluationLatency(ms)` after evaluation completes.
- Use `getEvaluationLatencySnapshot()` for debugging or future health views.

