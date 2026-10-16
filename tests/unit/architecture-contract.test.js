/**
 * Source architecture contracts. Read the production tree once; keep the six
 * independent legacy-module and namespace checks previously spread over three
 * files. These remain ordinary deterministic tests, not a rendering workload.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'src');
const sources = new Map();
const collect = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(file);
    else if (entry.isFile() && entry.name.endsWith('.js')) {
      sources.set(path.relative(ROOT, file), fs.readFileSync(file, 'utf8'));
    }
  }
};
collect(SRC);
const BARE_NAMESPACE = /^\s*window\.Vectura\s*=\s*window\.Vectura\s*\|\|\s*\{\}\s*;?\s*$/m;

describe('Production source architecture contracts', () => {
  it('does not reintroduce the retired UI module', () => {
    expect(fs.existsSync(path.join(SRC, 'ui/_ui-legacy.js'))).toBe(false);
  });

  it('does not load the retired UI module from the app shell', () => {
    expect(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'))
      .not.toMatch(/<script[^>]*_ui-legacy\.js/);
  });

  it('does not reference the retired UI module in production source', () => {
    expect([...sources].filter(([, code]) => code.includes('_ui-legacy.js')).map(([file]) => file))
      .toEqual([]);
  });

  it('initializes the namespace through a local alias', () => {
    expect([...sources].filter(([, code]) => BARE_NAMESPACE.test(code)).map(([file]) => file))
      .toEqual([]);
  });

  it.each(['shortcuts.js', 'persistence.js'])('%s safely aliases the namespace before UI access', (name) => {
    const text = sources.get(`src/ui/${name}`);
    expect(text).toBeDefined();
    expect(/const\s+Vectura\s*=\s*(?:\(?\s*)?(?:G|window)\.Vectura/.test(text)).toBe(true);
    expect(/window\.Vectura\.UI\s*=\s*window\.Vectura\.UI/.test(text)).toBe(false);
  });
});
