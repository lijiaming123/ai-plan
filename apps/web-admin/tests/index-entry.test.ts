import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('web-admin entrypoint', () => {
  it('serves an index html with vue mount root', () => {
    const indexPath = resolve(process.cwd(), 'index.html');
    expect(existsSync(indexPath)).toBe(true);

    const html = readFileSync(indexPath, 'utf-8');
    expect(html).toContain('id="app"');
    expect(html).toContain('/src/main.ts');
  });
});
