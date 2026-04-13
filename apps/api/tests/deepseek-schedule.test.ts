import { describe, expect, it } from 'vitest';
import {
  buildFallbackSchedule,
  extractLastJsonCodeBlock,
  stripLastJsonCodeBlock,
  parseScheduleWireOrNull,
  validateScheduleStrict,
} from '../src/modules/plans/deepseek-schedule';

describe('deepseek schedule protocol', () => {
  it('should extract last json fenced block', () => {
    const raw = [
      '正文',
      '```json',
      '{"schedule":{"granularity":"day","slots":[{"slotKey":"2026-04-13","content":"a"}]}}',
      '```',
      '```json',
      '{"schedule":{"granularity":"day","slots":[{"slotKey":"2026-04-14","content":"b"}]}}',
      '```',
    ].join('\n');
    expect(extractLastJsonCodeBlock(raw)).toContain('2026-04-14');
  });

  it('should strip last json fenced block from text', () => {
    const raw = ['正文A', '```json', '{"a":1}', '```', '尾巴'].join('\n');
    expect(stripLastJsonCodeBlock(raw)).toContain('正文A');
    expect(stripLastJsonCodeBlock(raw)).toContain('尾巴');
    expect(stripLastJsonCodeBlock(raw)).not.toContain('```json');
  });

  it('parse should return null for invalid json', () => {
    expect(parseScheduleWireOrNull('{')).toBeNull();
  });

  it('validate should enforce granularity and slotKey order', () => {
    const wire = parseScheduleWireOrNull(
      JSON.stringify({
        schedule: {
          granularity: 'day',
          slots: [
            { slotKey: '2026-04-13', content: 'x' },
            { slotKey: '2026-04-14', content: 'y' },
          ],
        },
      })
    )!;
    const ok = validateScheduleStrict({
      expectedGranularity: 'day',
      expectedSlotKeys: ['2026-04-13', '2026-04-14'],
      wire,
    });
    expect(ok.ok).toBe(true);

    const bad = validateScheduleStrict({
      expectedGranularity: 'day',
      expectedSlotKeys: ['2026-04-13', '2026-04-15'],
      wire,
    });
    expect(bad.ok).toBe(false);
  });

  it('fallback should populate generatedContent/content', () => {
    const s = buildFallbackSchedule({ granularity: 'week', slotKeys: ['W1', 'W2'] });
    expect(s.slots).toHaveLength(2);
    expect(s.slots[0]?.generatedContent).toContain('本周目标');
    expect(s.slots[0]?.contentSource).toBe('generated');
  });
});

