import { describe, expect, it } from 'vitest';
import { createDraftStreamSplitter, humanVisiblePrefix } from '../src/modules/plans/draft-stream-split';

describe('draft-stream-split', () => {
  it('humanVisiblePrefix：应在 ```json 前截断', () => {
    const a = '你好\n\n```json\n{"a":1}\n```';
    expect(humanVisiblePrefix(a)).toBe('你好');
  });

  it('humanVisiblePrefix：围栏未闭合时仍截断围栏起点之后', () => {
    const a = '正文一段\n```json\n{"schedule"';
    expect(humanVisiblePrefix(a)).toBe('正文一段');
  });

  it('humanVisiblePrefix：无围栏但出现行首 JSON schedule 时截断', () => {
    const a = '说明文字\n\n{ "schedule": { "granularity": "day"';
    expect(humanVisiblePrefix(a)).toBe('说明文字');
  });

  it('createDraftStreamSplitter：整段模型输出仍保留，展示前缀不含 JSON区', () => {
    const s = createDraftStreamSplitter();
    s.addChunk('第一段说明\n\n');
    s.addChunk('```json\n{"schedule":{"granularity":"day","slots":[]}}\n```');
    expect(s.getFull()).toContain('"schedule"');
    expect(humanVisiblePrefix(s.getFull())).toBe('第一段说明');
  });

  it('createDraftStreamSplitter：流式增量不包含围栏后内容', () => {
    const s = createDraftStreamSplitter();
    const d1 = s.addChunk('前言').deltaText;
    const d2 = s.addChunk('与正文\n```json').deltaText;
    const d3 = s.addChunk('\n{"a":1}').deltaText;
    const joined = d1 + d2 + d3;
    expect(joined).not.toContain('schedule');
    expect(joined).not.toContain('{ "a"');
    expect(s.getFull()).toContain('{');
  });

  it('createDraftStreamSplitter：进入 JSON 区后 scheduleJsonStarted 仅触发一次', () => {
    const s = createDraftStreamSplitter();
    expect(s.addChunk('说明').scheduleJsonStarted).toBe(false);
    const r2 = s.addChunk('\n```json\n{"schedule":');
    expect(r2.deltaText).not.toContain('schedule');
    expect(r2.scheduleJsonStarted).toBe(true);
    expect(s.addChunk('1}').scheduleJsonStarted).toBe(false);
  });
});
