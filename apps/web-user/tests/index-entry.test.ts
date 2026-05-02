import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webUserRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('web-user entrypoint', () => {
  it('serves an index html with vue mount root', () => {
    const indexPath = resolve(webUserRoot, 'index.html');
    expect(existsSync(indexPath)).toBe(true);

    const html = readFileSync(indexPath, 'utf-8');
    expect(html).toContain('id="app"');
    expect(html).toContain('/src/main.ts');
  });
});
