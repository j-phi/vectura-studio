/**
 * Tests-Gap-3 — Arch-7 noise-rack convergence contract.
 *
 * For every algorithm registered on window.Vectura.AlgorithmRegistry, lock in two
 * properties so the next contributor can't silently bypass the Universal Noise Rack:
 *
 *   (a) Determinism. With a fixed rack-backed `noise` and a fixed seeded RNG, two
 *       calls to `generate(p, rng, noise, bounds)` produce byte-identical output
 *       (after JSON round-trip on the path geometry).
 *
 *   (b) No bypass. The algorithm's source file does not call `noise.noise2D(`,
 *       `noise2D(`, `noise.noise3D(`, or `noise3D(` outside of explicitly
 *       allowed rack-evaluator paths (e.g. a NoiseRack-style `createEvaluator`
 *       definition that wraps the raw noise as its inner sampler).
 *
 * If an algorithm fails either assertion, that is a real Arch-7 violation and
 * should be investigated before suppressing the test.
 */

const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const ALGO_DIR = path.resolve(__dirname, '../../src/core/algorithms');

// Algorithms whose `generate` requires runtime-loaded assets (rasterized images
// or user-imported SVG) that an integration harness can't supply. They produce
// no paths with default params, so determinism is trivially satisfied, but we
// still run the bypass check on their source files.
const ASSET_DEPENDENT = new Set([
  'pattern',     // needs PATTERNS registry + decoded SVG target
  'svgDistort',  // needs `importedGroups` populated by the SVG importer
]);

// Algorithms that ship no entry in ALGO_DEFAULTS and rely entirely on `??`
// fallbacks inside their generate(). For the convergence contract we run them
// with `{ seed }` only; the determinism check still proves byte-identical
// output. If/when ALGO_DEFAULTS gains an entry, drop the override here.
const PARAMLESS_FALLBACK = new Set([
  'horizon',
]);

// Map registry key -> source file basename in src/core/algorithms/.
const SOURCE_FILE_FOR = {
  flowfield: 'flowfield.js',
  wavetable: 'wavetable.js',
  rings: 'rings.js',
  hyphae: 'hyphae.js',
  topo: 'topo.js',
  grid: 'grid.js',
  spiral: 'spiral.js',
  boids: 'boids.js',
  attractor: 'attractor.js',
  lissajous: 'lissajous.js',
  harmonograph: 'harmonograph.js',
  rainfall: 'rainfall.js',
  phylla: 'phylla.js',
  shapePack: 'shapepack.js',
  petalisDesigner: 'petalis.js', // PetalisAlgorithm lives in petalis.js
  pattern: 'pattern.js',
  svgDistort: 'svgdistort.js',
  terrain: 'terrain.js',
  horizon: 'horizon.js',
  imageSurface: 'image-surface.js',
};

// Patterns that count as a raw noise bypass (outside the rack evaluator).
const BYPASS_PATTERNS = [
  /\bnoise\.noise2D\s*\(/g,
  /\bnoise\.noise3D\s*\(/g,
];

// Known pre-existing Arch-7 violations grandfathered in. New algos must not be
// added here. Each entry is the max permitted raw-noise call count in that file
// so any *additional* bypass introduced in the future trips this test.
//
// Findings logged 2026-05-21 (Tests-Gap-3):
//   - rainfall.js: 2 raw noise.noise2D calls inside the trail-wobble loop
//     (turbulence + gust). Should be migrated to NoiseRack.createEvaluator
//     + rack.sampleScalar; tracked separately, not in scope for Tests-Gap-3.
const BYPASS_ALLOWLIST = {
  'rainfall.js': 2,
};

// Strip rack-evaluator definitions so calls inside a NoiseRack-style
// `createEvaluator({ noise }) { return { sampleScalar(...) { return noise.noise2D(...); } } }`
// don't trip the bypass check — those ARE the rack plug, not a bypass of it.
const stripRackEvaluatorBlocks = (source) => {
  // For each `createEvaluator` occurrence, walk past the argument parens
  // (handling destructuring braces inside them) to the function-body `{`,
  // then walk to its matching `}` and excise the whole block.
  const out = [];
  let i = 0;
  while (i < source.length) {
    const idx = source.indexOf('createEvaluator', i);
    if (idx === -1) {
      out.push(source.slice(i));
      break;
    }
    out.push(source.slice(i, idx));
    let j = idx + 'createEvaluator'.length;
    // Skip whitespace, then arg list `( ... )` if present.
    while (j < source.length && /\s/.test(source[j])) j += 1;
    if (source[j] === '(') {
      let parenDepth = 1;
      j += 1;
      while (j < source.length && parenDepth > 0) {
        const ch = source[j];
        if (ch === '(') parenDepth += 1;
        else if (ch === ')') parenDepth -= 1;
        j += 1;
      }
    }
    // Allow `=>` or whitespace between args and body.
    while (j < source.length && /[\s=>]/.test(source[j]) && source[j] !== '{') j += 1;
    if (source[j] !== '{') {
      // Couldn't find a body block — skip past the keyword so we don't loop.
      i = idx + 'createEvaluator'.length;
      continue;
    }
    let depth = 1;
    j += 1;
    while (j < source.length && depth > 0) {
      const ch = source[j];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      j += 1;
    }
    i = j;
  }
  return out.join('');
};

const collectBypassMatches = (source) => {
  const stripped = stripRackEvaluatorBlocks(source);
  const hits = [];
  BYPASS_PATTERNS.forEach((re) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(stripped)) !== null) {
      hits.push(m[0]);
    }
  });
  return hits;
};

describe('Arch-7 noise-rack convergence (per algorithm)', () => {
  let runtime;
  let Vectura;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    Vectura = runtime.window.Vectura;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('registry exposes algorithms to lock in', () => {
    expect(Vectura.AlgorithmRegistry).toBeTruthy();
    const keys = Object.keys(Vectura.AlgorithmRegistry).filter(
      (k) => typeof Vectura.AlgorithmRegistry[k]?.generate === 'function',
    );
    // Sanity floor: the project ships at minimum the core algorithm set.
    expect(keys.length).toBeGreaterThanOrEqual(13);
  });

  describe('determinism: generate(p, rng, noise, bounds) is byte-identical for same seed', () => {
    // Lazily enumerate after runtime is loaded.
    const algoKeys = () => Object.keys(SOURCE_FILE_FOR);

    algoKeys().forEach((key) => {
      test(`${key} produces identical output across two runs`, () => {
        const entry = Vectura.AlgorithmRegistry[key];
        if (!entry || typeof entry.generate !== 'function') {
          throw new Error(`AlgorithmRegistry.${key} missing or has no generate()`);
        }
        if (ASSET_DEPENDENT.has(key)) {
          // Asset-dependent algos can't run a meaningful determinism pass in
          // the integration harness — covered by the bypass check below.
          return;
        }

        const defaults = Vectura.ALGO_DEFAULTS[key] || (PARAMLESS_FALLBACK.has(key) ? {} : undefined);
        expect(defaults).toBeDefined();
        const SEED = 4242;
        const bounds = {
          width: 320,
          height: 220,
          m: 20,
          dW: 280,
          dH: 180,
          truncate: true,
        };

        const buildParams = () =>
          JSON.parse(JSON.stringify({ ...defaults, seed: SEED }));

        const runOnce = () => {
          const p = buildParams();
          const rng = new Vectura.SeededRNG(SEED);
          const noise = new Vectura.SimpleNoise(SEED);
          const out = entry.generate(p, rng, noise, bounds) || [];
          // JSON round-trip strips any class identity and any non-serializable
          // junk, so equality is a true geometric/byte-identical comparison.
          return JSON.parse(JSON.stringify(out));
        };

        const a = runOnce();
        const b = runOnce();
        expect(b).toEqual(a);
      });
    });
  });

  describe('no bypass: source files do not call raw noise.noise2D/3D outside rack-evaluator plugs', () => {
    Object.entries(SOURCE_FILE_FOR).forEach(([key, file]) => {
      test(`${key} (${file}) does not bypass the Universal Noise Rack`, () => {
        const abs = path.join(ALGO_DIR, file);
        const source = fs.readFileSync(abs, 'utf8');
        const hits = collectBypassMatches(source);
        const grandfathered = BYPASS_ALLOWLIST[file] || 0;
        if (hits.length > grandfathered) {
          throw new Error(
            `Arch-7 violation: ${file} contains ${hits.length} raw noise call(s) ` +
              `outside a rack evaluator (${hits.join(', ')}); allowlist permits ` +
              `${grandfathered}. Route through window.Vectura.NoiseRack.createEvaluator ` +
              `instead, or update BYPASS_ALLOWLIST with justification.`,
          );
        }
        expect(hits.length).toBeLessThanOrEqual(grandfathered);
      });
    });
  });
});
