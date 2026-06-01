import { describe, expect, it, vi } from 'vitest';
import { downloadCsv, type CsvColumn } from '../src/lib/csv-export';

describe('csv-export', () => {
  it('builds csv with bom and escaped values', () => {
    const columns: CsvColumn[] = [
      { key: 'a', label: '列A' },
      { key: 'b', label: '列B' },
    ];
    const rows = [{ a: 'hello', b: 'a,b' }];
    const blobParts: BlobPart[] = [];
    const orig = URL.createObjectURL;
    URL.createObjectURL = () => 'blob:test';
    const anchor = document.createElement('a');
    const clicks: string[] = [];
    anchor.click = () => {
      clicks.push('click');
    };
    const createSpy = vi.spyOn(document, 'createElement').mockReturnValue(anchor as HTMLAnchorElement);
    const blobSpy = vi.spyOn(globalThis, 'Blob').mockImplementation((parts) => {
      blobParts.push(...(parts as BlobPart[]));
      return {} as Blob;
    });

    downloadCsv('test.csv', columns, rows);

    expect(clicks).toEqual(['click']);
    const text = String(blobParts[0] ?? '');
    expect(text.startsWith('\uFEFF')).toBe(true);
    expect(text).toContain('列A');
    expect(text).toContain('"a,b"');

    createSpy.mockRestore();
    blobSpy.mockRestore();
    URL.createObjectURL = orig;
  });
});
