/*
 * Curve unification, Stage F (2026-07-13) — guardrail test.
 *
 * Path simplification has exactly TWO canonical implementations, both in
 * `src/core/geometry-utils.js` and both exported on `Vectura.GeometryUtils`:
 *
 *   - simplifyPath(path, tolerance)             — Ramer-Douglas-Peucker.
 *                                                 tolerance = perpendicular DISTANCE.
 *   - simplifyPathVisvalingam(path, tolerance)  — Visvalingam-Whyatt.
 *                                                 tolerance is SQUARED into an AREA.
 *
 * The two tolerances are NOT interchangeable. `src/core/algorithms/pattern.js`
 * used to carry a third hand-rolled RDP (`_douglasPeucker`); it is retired and
 * its call sites now go through `GeometryUtils.simplifyPath`.
 *
 * A simplifier may still be *named* outside geometry-utils.js — but only as a
 * thin wrapper that delegates. This test fails if such a function stops
 * delegating (i.e. someone hand-rolls the maths again), which is exactly how the
 * previous copy was born.
 *
 * ONE deliberate exception, allowlisted below: `geometry3d.js` `decimate`. It is
 * not a simplifier in the RDP/Visvalingam family at all — it is a greedy 3-point
 * collinearity filter, and it produces different output from RDP on a gently
 * bowed run (RDP is the more faithful of the two). Swapping it changes the
 * byte-compared `terrain-free3d-occluded` SVG baseline, so it stays until someone
 * refreshes that baseline on purpose. `simplify-shared-parity.test.js` pins both
 * the agreement and the divergence.
 *
 * Note: `GeometryUtils.simplifyPath` runs `stripCurveMeta`, which DELETES
 * `meta.anchors` / `meta.shape` — mutating the point array invalidates the
 * parametric outline they describe. Both retired call sites pass bare point
 * arrays, so it is a no-op there; a new caller passing a path WITH curve meta
 * must decide deliberately.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'src');
const CANONICAL = path.join(SRC, 'core/geometry-utils.js');

// A simplifier declared by any of its common names.
const SIMPLIFY_DECL = /(?:(?:const|let|var)\s+(_?(?:douglasPeucker|ramerDouglasPeucker|rdp|decimate|simplifyPath|simplifyPathVisvalingam))\s*=|function\s+(_?(?:douglasPeucker|ramerDouglasPeucker|rdp|decimate|simplifyPath|simplifyPathVisvalingam))\s*\()/gi;

// How many lines after the declaration may be scanned for the delegation.
const DELEGATION_WINDOW = 12;

// Declarations that are knowingly NOT delegations. Adding an entry here is a
// claim that the function is not an RDP/Visvalingam copy — justify it.
const ALLOWED = new Set([
  // Greedy 3-point collinearity filter, not RDP. See the header.
  'src/core/algorithms/geometry3d.js -> decimate',
]);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && full.endsWith('.js')) out.push(full);
  }
  return out;
}

describe('Stage F: path simplification single source of truth', () => {
  const files = walk(SRC).filter((f) => f !== CANONICAL);

  const findOffenders = (fileList) => {
    const offenders = [];
    for (const file of fileList) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        SIMPLIFY_DECL.lastIndex = 0;
        const m = SIMPLIFY_DECL.exec(line);
        if (!m) return;
        const id = `${path.relative(ROOT, file).split(path.sep).join('/')} -> ${m[1] || m[2]}`;
        if (ALLOWED.has(id)) return;
        const body = lines.slice(i, i + DELEGATION_WINDOW).join('\n');
        if (!body.includes('GeometryUtils')) offenders.push(`${id} (line ${i + 1})`);
      });
    }
    return offenders;
  };

  test('every simplifier outside geometry-utils.js delegates to GeometryUtils', () => {
    const offenders = findOffenders(files);
    expect(
      offenders,
      `hand-rolled simplifier(s) found — route them through Vectura.GeometryUtils:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  test('no algorithm file re-implements RDP or a decimator', () => {
    const algos = files.filter((f) => f.includes(`${path.sep}algorithms${path.sep}`));
    const offenders = findOffenders(algos);
    expect(offenders, `algorithm-local simplifier(s):\n${offenders.join('\n')}`).toEqual([]);
  });

  test('the allowlist is exact — every exempted declaration still exists', () => {
    for (const id of ALLOWED) {
      const [rel, name] = id.split(' -> ');
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(text, `${rel} no longer declares ${name} — drop it from ALLOWED`)
        .toMatch(new RegExp(`(?:const|let|var)\\s+${name}\\s*=|function\\s+${name}\\s*\\(`));
    }
  });

  test('both canonical simplifiers live in geometry-utils.js and are exported', () => {
    const text = fs.readFileSync(CANONICAL, 'utf8');
    expect(text).toMatch(/const simplifyPath = \(path, tolerance\) =>/);
    expect(text).toMatch(/const simplifyPathVisvalingam = \(path, tolerance\) =>/);
    expect(text).toMatch(/^\s*simplifyPath,$/m);
    expect(text).toMatch(/^\s*simplifyPathVisvalingam,$/m);
  });

  test('the retired call site routes through GeometryUtils.simplifyPath', () => {
    const pattern = fs.readFileSync(path.join(SRC, 'core/algorithms/pattern.js'), 'utf8');
    expect(pattern).toContain('GU.simplifyPath(pts, tolerance)');
    expect(pattern).not.toContain('_douglasPeucker');
  });
});
