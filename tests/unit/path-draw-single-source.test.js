/*
 * Curve unification (2026-07) — guardrail test.
 *
 * `src/core/path-draw.js` is the single source of truth for "how is this path
 * drawn?" — the cubic / verbatim / quadratic branch. That decision used to be
 * hand-copied in SIX places (renderer.tracePath, ui.pathToSvg,
 * export-svg.buildExportPreviewPath, geometry-utils.flattenSmoothedPath,
 * path-edit-ops.flattenForEdit, tests/helpers/svg.shapeToSvg) and had already
 * drifted apart. This test fails if a seventh copy appears.
 *
 * The branch is fingerprinted by its two irreducible emissions — no consumer can
 * re-implement the midpoint quadratic without one of them:
 *
 *   1. `ctx.quadraticCurveTo(...)`  — the canvas emission.
 *   2. an interpolated `Q ${...}` SVG command — the `d`-string emission.
 *
 * Both must exist ONLY inside path-draw.js; every other module routes through
 * PathDraw.toCanvas / PathDraw.toSvgD / PathDraw.commands.
 *
 * Deliberate exclusions (these are NOT the path-draw branch):
 *
 *   - `src/vendor/` — third-party (opentype.min.js) — not ours to unify.
 *   - Zero-argument `quadraticCurveTo() {}` declarations in
 *     tests/helpers/load-vectura-runtime.js and tests/helpers/load-ui-component.js.
 *     Those are no-op METHOD STUBS on a fake 2D context, not calls. The
 *     `quadraticCurveTo(<arg>` regex requires at least one argument, so a stub
 *     cannot match; a real call always can.
 *   - `bezierCurveTo(` is NOT guarded. Cubics have many legitimate uses outside
 *     the path-draw branch — the direct-selection anchor/handle overlays and
 *     corner affordance rings in renderer.js, and the Pattern Designer's preview
 *     canvas — and folding those into PathDraw would be wrong. The quadratic is
 *     unique to the branch, which is what makes it a clean fingerprint.
 *   - Literal `Q 22 16` commands in hardcoded SVG ICON markup (mirror-panel.js)
 *     and `case 'Q':` command PARSERS (google-fonts.js, ui-text-specimen.js,
 *     ui-pattern-designer.js). Those consume or decorate; they do not serialize
 *     path geometry. The `Q\s*\$\{` regex requires interpolation, so neither
 *     form matches.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CANONICAL = path.join(ROOT, 'src/core/path-draw.js');

// A real call: `quadraticCurveTo(` followed by at least one argument character.
// Zero-arg stub declarations (`quadraticCurveTo() {}`) do not match.
const CANVAS_QUADRATIC = /quadraticCurveTo\s*\(\s*[^)\s]/g;
// An SVG quadratic command interpolated into a `d` string: ` Q ${x} ${y} ...`.
// Static icon markup and `case 'Q':` parsers do not match.
const SVG_QUADRATIC = /Q\s*\$\{/g;

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'vendor') continue;
      out.push(...walk(full));
    } else if (entry.isFile() && full.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

const SOURCES = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'tests/helpers'))];

const offenders = (pattern) => {
  const hits = [];
  for (const file of SOURCES) {
    if (file === CANONICAL) continue;
    const matches = fs.readFileSync(file, 'utf8').match(pattern);
    if (matches) hits.push(`${path.relative(ROOT, file)} (${matches.length}×)`);
  }
  return hits;
};

describe('PathDraw single source of truth', () => {
  it('no file outside path-draw.js emits a canvas quadratic', () => {
    const hits = offenders(CANVAS_QUADRATIC);
    expect(
      hits,
      `quadraticCurveTo() must only be called by PathDraw.toCanvas. Route these through it:\n  ${hits.join('\n  ')}`,
    ).toEqual([]);
  });

  it('no file outside path-draw.js emits an SVG quadratic command', () => {
    const hits = offenders(SVG_QUADRATIC);
    expect(
      hits,
      `The 'Q' path command must only be emitted by PathDraw (commands/toSvgD). Route these through it:\n  ${hits.join('\n  ')}`,
    ).toEqual([]);
  });

  it('path-draw.js actually owns the canonical quadratic emission', () => {
    // Non-vacuity: if PathDraw ever stopped emitting a quadratic, the two greps
    // above would pass trivially and the guard would be worthless.
    const text = fs.readFileSync(CANONICAL, 'utf8');
    expect(text.match(CANVAS_QUADRATIC), 'PathDraw.toCanvas must call quadraticCurveTo').toHaveLength(1);
    expect(text).toMatch(/case 'Q':/);
  });

  it("the guard's regexes are not vacuous", () => {
    // `.match()` (not `.test()`) — these patterns are /g, so `.test()` would be
    // stateful across assertions.
    const hits = (pattern, text) => (text.match(pattern) || []).length;

    // Both patterns must actually match the shape of code they exist to ban.
    expect(hits(CANVAS_QUADRATIC, 'ctx.quadraticCurveTo(path[i].x, path[i].y, midX, midY);')).toBe(1);
    expect(hits(SVG_QUADRATIC, 'd += ` Q ${fmt(path[i].x)} ${fmt(path[i].y)}`;')).toBe(1);

    // ...and must NOT match the documented exclusions.
    expect(hits(CANVAS_QUADRATIC, 'quadraticCurveTo() {},')).toBe(0);
    expect(hits(SVG_QUADRATIC, '<path d="M 2 4  Q 22 16 40.4 16"/>')).toBe(0);
    expect(hits(SVG_QUADRATIC, "} else if (c.type === 'Q') {")).toBe(0);
  });
});
