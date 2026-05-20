/*
 * Redundancy-1 PR 2 (2026-05-20) — guardrail test.
 *
 * Asserts that the `smoothPath(path, amount)` helper has only ONE canonical
 * definition in the codebase — `src/core/geometry-utils.js`. A byte-identical
 * copy used to live in `src/ui/ui.js`; PR 2 of the Redundancy-1 cleanup
 * deletes that duplicate and routes the UI through `Vectura.GeometryUtils`.
 *
 * Note: `src/core/algorithms/topo.js` defines its own `smoothPath(path,
 * iterations, closed)` with a different signature for its closed-loop
 * resampling pipeline. That is a different function and is intentionally
 * excluded from this guard.
 *
 * If a future agent re-introduces a `smoothPath(path, amount)` declaration
 * outside `src/core/geometry-utils.js`, this test fails.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'src');

const TOPO_PATH = path.join(SRC, 'core/algorithms/topo.js');
const CANONICAL_PATH = path.join(SRC, 'core/geometry-utils.js');

// Match `const smoothPath = (path, amount)` or `function smoothPath(path, amount)`.
// Two-argument signature only — topo.js uses (path, iterations, closed).
const SMOOTH_PATH_DECL = /(?:const|let|var)\s+smoothPath\s*=\s*\(\s*path\s*,\s*amount\s*\)|function\s+smoothPath\s*\(\s*path\s*,\s*amount\s*\)/g;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && full.endsWith('.js')) out.push(full);
  }
  return out;
}

describe('Redundancy-1 PR 2: smoothPath single source of truth', () => {
  it('declares smoothPath(path, amount) exactly once across src/', () => {
    const files = walk(SRC).filter((f) => f !== TOPO_PATH);
    const hits = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      const matches = text.match(SMOOTH_PATH_DECL);
      if (matches) hits.push({ file, count: matches.length });
    }
    const total = hits.reduce((s, h) => s + h.count, 0);
    expect(total, `smoothPath(path, amount) declarations: ${JSON.stringify(hits, null, 2)}`).toBe(1);
  });

  it('canonical definition lives in src/core/geometry-utils.js', () => {
    const text = fs.readFileSync(CANONICAL_PATH, 'utf8');
    expect(text).toMatch(SMOOTH_PATH_DECL);
  });
});
