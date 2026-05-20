/*
 * Arch-7 (audit 2026-05-20) — guardrail tests.
 *
 * CLAUDE.md and docs/noise-rack-architecture.md are explicit: "new algorithm
 * noise work must converge on the shared model — do not introduce
 * algorithm-specific noise stacks." Two long-standing violations are fixed by
 * Arch-7:
 *
 *   1. `petalis.js` shipped a full inline `fallbackNoiseRack` (with its own
 *      `combineBlend` + `createEvaluator`) selected via
 *      `window.Vectura?.NoiseRack || fallbackNoiseRack`. Because
 *      `src/core/noise-rack.js` is guaranteed to load before
 *      `src/core/algorithms/petalis.js` in `index.html`, the fallback was
 *      unreachable dead code AND a maintenance trap — a parallel
 *      implementation that maintainers could silently edit instead of
 *      NoiseRack itself.
 *
 *   2. `rainfall.js` routed its multi-layer noise stack through the rack at
 *      lines 131/227/283 but then bypassed the rack for trail wobble and
 *      gust at lines 725/727 with raw `noise.noise2D(...)` calls. Two noise
 *      spaces in one algorithm.
 *
 * These regression tests assert the cleanups stay clean. If a future agent
 * reintroduces either bypass, the suite fails.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const stripComments = (source) =>
  source
    // strip block comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // strip line comments
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');

describe('Arch-7: petalis fallbackNoiseRack removed', () => {
  const petalisPath = path.join(ROOT, 'src/core/algorithms/petalis.js');
  const source = fs.readFileSync(petalisPath, 'utf8');
  const code = stripComments(source);

  it('does not declare or reference fallbackNoiseRack', () => {
    expect(code).not.toMatch(/fallbackNoiseRack/);
  });

  it('does not declare an inline combineBlend helper', () => {
    // The only legitimate combineBlend is the one on window.Vectura.NoiseRack.
    // A bare `combineBlend(` token (not preceded by `NoiseRack.` / `rackApi.`)
    // indicates a re-introduced inline definition.
    expect(code).not.toMatch(/(^|[^.\w])combineBlend\s*\(/m);
  });

  it('does not call noise.noise2D directly anywhere in the file', () => {
    // Petalis must route every noise sample through the Noise Rack evaluator.
    expect(code).not.toMatch(/noise\.noise2D\s*\(/);
  });

  it('still references window.Vectura.NoiseRack for the shared rack API', () => {
    expect(code).toMatch(/window\.Vectura\.NoiseRack/);
  });
});

describe('Arch-7: rainfall trail wobble + gust routed through Noise Rack', () => {
  const rainfallPath = path.join(ROOT, 'src/core/algorithms/rainfall.js');
  const source = fs.readFileSync(rainfallPath, 'utf8');
  const code = stripComments(source);

  it('does not call noise.noise2D directly (rack-only sampling)', () => {
    // Pre-Arch-7 lines 725 and 727 used raw noise.noise2D for trail wobble
    // and gust. After the migration, all rainfall noise samples must come
    // from the rack evaluator (`rack.evaluate(...)` / `sampleScalar(...)`).
    expect(code).not.toMatch(/noise\.noise2D\s*\(/);
  });

  it('still uses the Noise Rack API for stack composition', () => {
    expect(code).toMatch(/window\.Vectura\.NoiseRack/);
    expect(code).toMatch(/createEvaluator/);
    expect(code).toMatch(/combineBlend/);
  });
});
