/*
 * Cache-busting guardrail (v1.1.105).
 *
 * This is a no-build app: index.html lists ~150 local <script>/<link> tags with
 * no bundler hash. The browser always refetches index.html (it's the document)
 * but caches the JS/CSS modules by URL — so without a cache key, a soft reload
 * serves STALE JS even though the version badge (baked into index.html) looks
 * current. `npm run version:sync` stamps ?v=<package version> onto every LOCAL
 * (./-prefixed) script and stylesheet to invalidate that cache on each bump.
 *
 * These tests assert the stamp is present and correct, that external (https)
 * assets are left alone, and that there's no double-stamp (idempotency). If a
 * new local tag is added without re-running version:sync, this fails — prompting
 * the contributor to run it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

describe('index.html cache-busting', () => {
  it('every local <script src="./…js"> carries ?v=<package version>', () => {
    const tags = html.match(/<script\s+src="\.\/[^"]+"/g) || [];
    expect(tags.length).toBeGreaterThan(0);
    const missing = tags.filter((t) => !t.includes(`?v=${version}`));
    expect(missing).toEqual([]);
  });

  it('every local stylesheet <link href="./…css"> carries ?v=<package version>', () => {
    const tags = html.match(/href="\.\/[^"]+\.css[^"]*"/g) || [];
    expect(tags.length).toBeGreaterThan(0);
    const missing = tags.filter((t) => !t.includes(`?v=${version}`));
    expect(missing).toEqual([]);
  });

  it('external (https) assets are NOT version-stamped', () => {
    const externals = html.match(/(?:src|href)="https?:\/\/[^"]+"/g) || [];
    const stamped = externals.filter((t) => t.includes(`?v=${version}`));
    expect(stamped).toEqual([]);
  });

  it('no tag is double-stamped (idempotent sync)', () => {
    expect(html.includes('?v=') && /\?v=[^"]*\?v=/.test(html)).toBe(false);
  });
});
