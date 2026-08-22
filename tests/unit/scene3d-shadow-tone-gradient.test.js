const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Scene3D.Shadows — shadowToneDepth (Stage 1: the FLAT-path tone gradient).
 *
 * The product owner's ask: "All of the fill styles for shadows should
 * leverage the same tone functionality as the 3D object, rendering different
 * levels of shadow using the tone style. Closest to the object is darkest
 * shadow." This is the engine half — driving the flat shadow's local ink
 * density from distance-to-contact (t) through the OBJECT's own tone ladder
 * (Regions.band + Regions.coverageFor, src/core/scene3d/regions.js), via a
 * new `shadowToneDepth` param (0..1, default 0.75 — SHIPPED ON; see
 * params.js DEFAULT_SHADOW.shadowToneDepth for the owner's decision and the
 * "no flooding is possible" argument the default was picked from).
 *
 * Mechanism (shadows.js `applyShadowToneGradient`): each generated mark is
 * cut into ~6mm chunks; each chunk survives a deterministic hash test against
 * `duty = ladderCoverageAt(1 - t, tone) / ladderCoverageAt(1, tone)`, clamped
 * to [0,1] — so ink density can NEVER exceed today's flat baseline anywhere
 * (no flooding at any depth), it can only fall off toward the far tip.
 *
 * These tests are the RGR proof for that mechanism: they FAIL against the
 * pre-gradient shadows.js (no `shadowToneDepth`/`applyShadowToneGradient`/
 * `__toneGradientForTest` exist there) and pin two contracts:
 *   1. depth 0 is provably byte-identical to the pre-gradient flat shadow —
 *      the explicit escape hatch for saved documents / anyone opting out.
 *   2. depth 1 produces a MEASURED, clear near > far ink gradient — not the
 *      scout's proposed 1.3x (a guess, flagged as such), but a number taken
 *      from a clean, unconfounded synthetic footprint (a real scene's own
 *      wedge SHAPE confounds a raw near/far comparison with the tone effect,
 *      since the footprint is naturally narrower near the caster for most
 *      light angles — see the measurement note below).
 */

const clone = (value) => JSON.parse(JSON.stringify(value));

describe('Scene3D.Shadows — applyShadowToneGradient mechanism (synthetic, unconfounded footprint)', () => {
  let runtime;
  let V;
  let Shadows;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    Shadows = V.Scene3D.Shadows;
  });

  afterAll(() => runtime.cleanup());

  // A plain 100x20mm rectangle, contact edge at x=0, far tip at x=100. Using a
  // rectangle (not a real caster's wedge-shaped shadow) means the near/far
  // ink split below measures ONLY the tone mechanism, not the footprint's own
  // geometry — a real scene's shadow is naturally wider at its far tip for
  // most light angles, which would otherwise inflate "far" ink independent of
  // any tone effect and make the ratio meaningless.
  const rings = [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 20 }, { x: 0, y: 20 }]];
  const contactSegs = [[{ x: 0, y: 0 }, { x: 0, y: 20 }]];
  const tone = { enabled: true, bands: 3, thresholds: [0.33, 0.66], ladder: [0.2, 0.5, 0.85] };

  // Ten long lines spanning the full throw (x: 0..100) — the WORST case for
  // gradient resolution, since a hatch angle parallel to the throw direction
  // means every mark crosses the whole t range and must be chunked to show
  // any gradient at all.
  const buildLines = () => {
    const lines = [];
    for (let y = 1; y < 20; y += 2) lines.push([{ x: 0, y }, { x: 100, y }]);
    return lines;
  };

  const thirdsInk = (segs) => {
    const bands = [0, 0, 0];
    segs.forEach(([a, b]) => {
      const mx = (a.x + b.x) / 2;
      const idx = mx < 100 / 3 ? 0 : mx < 200 / 3 ? 1 : 2;
      bands[idx] += Math.hypot(b.x - a.x, b.y - a.y);
    });
    return bands; // [near, mid, far]
  };

  test('ladderCoverageAt reuses the OBJECT tone ladder verbatim (I=0 -> 0.2, I=1 -> 0.85)', () => {
    expect(Shadows.__ladderCoverageForTest(0, tone)).toBe(0.2);
    expect(Shadows.__ladderCoverageForTest(1, tone)).toBe(0.85);
  });

  test('depth <= 0 returns the input marks completely unmodified (the byte-identity escape hatch)', () => {
    const fields = Shadows.__shadowFieldsForTest(rings, contactSegs);
    const lines = buildLines();
    expect(Shadows.__toneGradientForTest(lines, fields, tone, 0)).toBe(lines);
    expect(Shadows.__toneGradientForTest(lines, fields, tone, -1)).toBe(lines);
  });

  test('HEADLINE — depth 1: near-third ink exceeds far-third ink by a clear, measured margin', () => {
    const fields = Shadows.__shadowFieldsForTest(rings, contactSegs);
    const graded = Shadows.__toneGradientForTest(buildLines(), fields, tone, 1);
    const [near, , far] = thirdsInk(graded);
    expect(far).toBeGreaterThan(0);
    const ratio = near / far;
    // Measured (TONE_CHUNK_MM=6, this exact fixture): ~4.6x. The theoretical
    // ceiling is maxLadderCov/minLadderCov = 0.85/0.2 = 4.25x (a chunk right
    // at the contact edge has duty 1; one right at the far tip has duty
    // 0.2/0.85); measured is close to it with a little chunk-boundary noise.
    // 3.0 is a wide, deliberate margin below every measured run (the scout's
    // proposed 1.3x was a guess, not a measurement).
    expect(ratio).toBeGreaterThan(3.0);
  });

  test('depth scales the effect monotonically: 1.0 gradient is stronger than the shipped 0.75 default', () => {
    const fields = Shadows.__shadowFieldsForTest(rings, contactSegs);
    const at075 = thirdsInk(Shadows.__toneGradientForTest(buildLines(), fields, tone, 0.75));
    const at1 = thirdsInk(Shadows.__toneGradientForTest(buildLines(), fields, tone, 1));
    expect(at075[0] / at075[2]).toBeGreaterThan(2.0); // shipped default: still a clear margin
    expect(at1[0] / at1[2]).toBeGreaterThan(at075[0] / at075[2]);
  });

  test('near-contact ink is IDENTICAL at every depth — duty is capped at 1, so it can never flood', () => {
    // duty(t=0) = ladderCoverageAt(1,tone)/maxCov = maxCov/maxCov = 1 exactly,
    // and `keepProb = 1 - depth*(1-duty)` collapses to 1 regardless of depth
    // whenever duty is already 1. So the near-contact band — already at the
    // flat baseline's own density — cannot be pushed any denser by turning
    // the knob up. This is the structural reason a high default cannot flood
    // the contact zone into solid black: there is no darker place to go.
    const fields = Shadows.__shadowFieldsForTest(rings, contactSegs);
    const near075 = thirdsInk(Shadows.__toneGradientForTest(buildLines(), fields, tone, 0.75))[0];
    const near1 = thirdsInk(Shadows.__toneGradientForTest(buildLines(), fields, tone, 1))[0];
    expect(near1).toBe(near075);
    expect(near1).toBeLessThanOrEqual(1000); // 10 lines * 100mm — a loose finiteness sanity bound
  });
});

describe('Scene3D.Shadows — shadowToneDepth on a real scene (byte-identity + default-is-on)', () => {
  let runtime;
  let V;
  let Shadows;
  let HLR;
  let Lighting;
  let defaults;

  const BOUNDS = { width: 320, height: 220, penWidth: 0.3 };
  const boxObj = (id, x, y, size = 40) => ({
    id, name: id, primitive: 'box', params: { sx: size, sy: size, sz: size },
    transform: { x, y, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
  });

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    Shadows = V.Scene3D.Shadows;
    HLR = V.Scene3D.HLR;
    Lighting = V.Scene3D.Lighting;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });

  afterAll(() => runtime.cleanup());

  const buildShadows = (shadowBag) => {
    const p = V.Scene3D.Params.normalizeParams({
      ...clone(defaults),
      objects: [boxObj('obj-1', 0, 20, 40)],
      ground: { enabled: true },
      lights: [{ id: 'sun', type: 'directional', castShadows: true, azimuth: 160, elevation: 45 }],
      camera: { projection: 'orthographic', yaw: 0, pitch: 55, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
      shadow: shadowBag,
    });
    const scene = V.Scene3D.Scene.assembleScene(p, BOUNDS);
    const clipper = HLR.createClipper([], { bias: 0.05 });
    const dir = Lighting.lightWorldDir(p.lights[0]);
    return Shadows.build(scene, p, BOUNDS, clipper, dir, { shadow: p.shadow });
  };

  const sPaths = (paths) => paths.filter((pp) => pp.meta && pp.meta.sceneTarget && pp.meta.sceneTarget.regionClass === 'castShadow');
  const inkOf = (p) => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); return s; };
  const summarize = (paths) => {
    const sp = sPaths(paths);
    return { n: sp.length, ink: Math.round(sp.reduce((s, p) => s + inkOf(p), 0) * 10000) / 10000 };
  };

  // Captured from `git show HEAD:src/core/scene3d/shadows.js` (this branch's
  // parent commit, before shadowToneDepth existed at all) run against this
  // exact scene, via `git stash` isolating only shadows.js/params.js. This IS
  // "the pre-gradient shadow output" — not a live A/B against another default,
  // which the sibling shadowToneLaw REGRESSION test at scene3d-shadow-tone-
  // law.test.js:124 already showed does not actually pin cross-version
  // behavior (it compares two current calls to each other).
  test('REGRESSION — explicit shadowToneDepth:0 reproduces the pre-gradient flat shadow byte-identical', () => {
    const withDepthZero = summarize(buildShadows({ shadowToneDepth: 0 }));
    expect(withDepthZero).toEqual({ n: 136, ink: 2798.9287 });
  });

  test('DEFAULT (no shadowToneDepth given) is the shipped 0.75, NOT 0 — it visibly differs from explicit 0', () => {
    const withDefault = summarize(buildShadows({}));
    const explicitZero = summarize(buildShadows({ shadowToneDepth: 0 }));
    expect(withDefault).not.toEqual(explicitZero);
    // Thinning only ever removes ink relative to the flat baseline (duty is
    // capped at 1), so the default's total ink is lower, never higher — the
    // "no flooding" property is observable end-to-end, not just at the
    // synthetic mechanism level above.
    expect(withDefault.ink).toBeLessThan(explicitZero.ink);
  });

  test('shadowToneDepth clamps out-of-range values into [0,1]', () => {
    const below = summarize(buildShadows({ shadowToneDepth: -5 }));
    const explicitZero = summarize(buildShadows({ shadowToneDepth: 0 }));
    expect(below).toEqual(explicitZero);
    const above = summarize(buildShadows({ shadowToneDepth: 5 }));
    const explicitOne = summarize(buildShadows({ shadowToneDepth: 1 }));
    expect(above).toEqual(explicitOne);
  });

  test('determinism — identical shadowToneDepth regenerates byte-identical output', () => {
    const a = buildShadows({ shadowToneDepth: 0.75 });
    const b = buildShadows({ shadowToneDepth: 0.75 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  // fs-z2 Defect 1 fix, observed end-to-end: the chunk-and-thin gradient
  // (fs-w1-shadowtone) chopped every ruling into ~6mm pieces to show a
  // near/far falloff, which on a real scene ~4x'd the path count for LESS
  // ink (16109.77mm/535 -> 11583.00mm/2174 in the protected shadow-anatomy
  // fixture — tests/unit/scene3d-cast-shadow-zones.test.js C12). The RGR
  // proof for THAT regression: before this fix, the default's path count on
  // this scene explodes well past the depth-0 baseline; after it (spacing
  // re-expression), it stays close.
  test('DEFECT 1 — the default (0.75) does not explode path count the way the retired chunker did', () => {
    const withDefault = summarize(buildShadows({}));
    const explicitZero = summarize(buildShadows({ shadowToneDepth: 0 }));
    // The chunker's signature failure was ~4x the depth-0 path count for less
    // ink. The spacing re-expression only ever WIDENS gaps (never adds a
    // line), so path count at depth 0.75 must stay at or below the depth-0
    // baseline — never balloon past it.
    expect(withDefault.n).toBeLessThanOrEqual(explicitZero.n);
  });
});

// fs-z2 (Stage 1.1) — the SPACING re-expression mechanism itself, isolated
// against the same synthetic, unconfounded rectangle fixture the retired
// chunker's own tests use above (contact edge at x=0, throw axis along x,
// 0..100). `__gradedHatchForTest` drives the real `hatchRingsEvenOdd` marching
// scan (shadows.js) at a chosen ruling ANGLE, so both orientations that
// matter are directly testable:
//   angle=90  — rulings run crosswise to the throw (perpendicular to it), so
//               sweeping the perpendicular axis (parallel to the throw here)
//               IS sweeping through t. This is the case a spacing gradient
//               can actually express, and it must show up as WIDENING gaps
//               with fully continuous rulings (no chopping).
//   angle=0   — rulings run PARALLEL to the throw (the retired chunker's own
//               "worst case" fixture, reused verbatim here). Sweeping the
//               perpendicular axis in this orientation sweeps ACROSS the
//               throw, not along it — every scanline crosses the whole
//               footprint, so there is no scan-axis position whose average
//               distance-to-contact differs from any other. A spacing
//               gradient is mathematically incapable of expressing a
//               near/far falloff here (this is the "genuinely impractical"
//               case named in the task, evidenced by this very test): the
//               honest degrade is near-uniform spacing, not fabricating a
//               gradient and not falling back to fragmentation.
describe('Scene3D.Shadows — applyShadowToneGradient spacing re-expression (fs-z2 Stage 1.1)', () => {
  let runtime;
  let V;
  let Shadows;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    Shadows = V.Scene3D.Shadows;
  });

  afterAll(() => runtime.cleanup());

  const rings = [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 20 }, { x: 0, y: 20 }]];
  const contactSegs = [[{ x: 0, y: 0 }, { x: 0, y: 20 }]];
  const tone = { enabled: true, bands: 3, thresholds: [0.33, 0.66], ladder: [0.2, 0.5, 0.85] };
  const penWidth = 0.3;
  const sBase = 2; // a plot-plausible base pitch, independent of the tone ladder's own scale

  test('angle=90 (crosswise to the throw): every ruling stays a single, unbroken full-height line', () => {
    const fields = Shadows.__shadowFieldsForTest(rings, contactSegs);
    const marks = Shadows.__gradedHatchForTest(rings, 90, sBase, fields, tone, 1, penWidth);
    expect(marks.length).toBeGreaterThan(5);
    marks.forEach(([a, b]) => {
      // The rectangle is 20mm tall; a continuous ruling crossing it end to
      // end measures ~20mm. A fragmenting mechanism would emit many pieces
      // well under that.
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      expect(len).toBeGreaterThan(19);
      expect(len).toBeLessThan(20.1);
    });
  });

  test('angle=90: ruling spacing packs tighter near contact (x=0) than toward the far tip (x=100)', () => {
    const fields = Shadows.__shadowFieldsForTest(rings, contactSegs);
    const marks = Shadows.__gradedHatchForTest(rings, 90, sBase, fields, tone, 1, penWidth);
    const xs = marks.map(([a, b]) => (a.x + b.x) / 2).sort((p, q) => p - q);
    const gaps = [];
    for (let i = 1; i < xs.length; i++) gaps.push(xs[i] - xs[i - 1]);
    const thirdLen = Math.floor(gaps.length / 3) || 1;
    const nearGaps = gaps.slice(0, thirdLen);
    const farGaps = gaps.slice(-thirdLen);
    const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
    const nearAvg = avg(nearGaps);
    const farAvg = avg(farGaps);
    expect(farAvg).toBeGreaterThan(nearAvg * 1.5);
  });

  test('depth 0 collapses angle=90 back to plain uniform spacing (the byte-identity escape hatch, expressed as spacing)', () => {
    const fields = Shadows.__shadowFieldsForTest(rings, contactSegs);
    const graded0 = Shadows.__gradedHatchForTest(rings, 90, sBase, fields, tone, 0, penWidth);
    const xs = graded0.map(([a, b]) => (a.x + b.x) / 2).sort((p, q) => p - q);
    const gaps = [];
    for (let i = 1; i < xs.length; i++) gaps.push(xs[i] - xs[i - 1]);
    const avg = gaps.reduce((s, v) => s + v, 0) / gaps.length;
    gaps.forEach((g) => expect(Math.abs(g - avg)).toBeLessThan(0.05));
    expect(Math.abs(avg - sBase)).toBeLessThan(0.05);
  });

  test('angle=0 (parallel to the throw, the adversarial case): spacing cannot express a gradient — degrades to near-uniform, still fully continuous (no fragmentation)', () => {
    const fields = Shadows.__shadowFieldsForTest(rings, contactSegs);
    const marks = Shadows.__gradedHatchForTest(rings, 0, sBase, fields, tone, 1, penWidth);
    // Still continuous — every ruling spans the full 100mm throw, never chopped.
    marks.forEach(([a, b]) => {
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      expect(len).toBeGreaterThan(99);
    });
    // But honestly uniform: consecutive rulings (stacked along y here) sit at
    // a near-constant pitch, because a scanline's own representative point
    // does not systematically drift toward or away from contact as the scan
    // advances in this orientation. This is the "genuinely impractical" case
    // acknowledged rather than papered over with fragmentation.
    const ys = marks.map(([a, b]) => (a.y + b.y) / 2).sort((p, q) => p - q);
    const gaps = [];
    for (let i = 1; i < ys.length; i++) gaps.push(ys[i] - ys[i - 1]);
    const avg = gaps.reduce((s, v) => s + v, 0) / gaps.length;
    const maxDelta = Math.max(...gaps.map((g) => Math.abs(g - avg)));
    expect(maxDelta).toBeLessThan(avg * 0.5);
  });
});

// fs-z2 Defect 2 — "No Tone" (shadowToneLaw: 'none') must force the gradient
// off, mirroring the object-side Stage-0 sentinel (surface-fill.js:
// `askedLaw === 'none'` -> masterGrid/dither both off). Before this fix,
// shadowToneDepth was read independently of shadowToneLaw, so a shadow with
// Fill Style "No Tone" still rendered a toned (in the old mechanism,
// fragmenting) gradient — the owner's exact reported repro.
describe('Scene3D.Shadows — shadowToneLaw "none" disables shadowToneDepth (fs-z2 Defect 2)', () => {
  let V;
  let HLR;
  let Lighting;
  let defaults;
  let runtime;

  const BOUNDS = { width: 320, height: 220, penWidth: 0.3 };
  const boxObj = (id, x, y, size = 40) => ({
    id, name: id, primitive: 'box', params: { sx: size, sy: size, sz: size },
    transform: { x, y, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
  });

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    HLR = V.Scene3D.HLR;
    Lighting = V.Scene3D.Lighting;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });

  afterAll(() => runtime.cleanup());

  const buildShadows = (shadowBag) => {
    const p = V.Scene3D.Params.normalizeParams({
      ...clone(defaults),
      objects: [boxObj('obj-1', 0, 20, 40)],
      ground: { enabled: true },
      lights: [{ id: 'sun', type: 'directional', castShadows: true, azimuth: 160, elevation: 45 }],
      camera: { projection: 'orthographic', yaw: 0, pitch: 55, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
      shadow: shadowBag,
    });
    const scene = V.Scene3D.Scene.assembleScene(p, BOUNDS);
    const clipper = HLR.createClipper([], { bias: 0.05 });
    const dir = Lighting.lightWorldDir(p.lights[0]);
    return V.Scene3D.Shadows.build(scene, p, BOUNDS, clipper, dir, { shadow: p.shadow });
  };

  const sPaths = (paths) => paths.filter((pp) => pp.meta && pp.meta.sceneTarget && pp.meta.sceneTarget.regionClass === 'castShadow');

  test('HEADLINE — toneLaw: "none" at the shipped default depth (0.75) is byte-identical to shadowToneDepth: 0', () => {
    const withNoneDefault = sPaths(buildShadows({ shadowToneLaw: 'none' }));
    const withNoneZero = sPaths(buildShadows({ shadowToneLaw: 'none', shadowToneDepth: 0 }));
    expect(JSON.stringify(withNoneDefault)).toBe(JSON.stringify(withNoneZero));
  });

  test('toneLaw: "none" stays byte-identical across every shadowToneDepth value — depth is inert once No Tone is selected', () => {
    const base = JSON.stringify(sPaths(buildShadows({ shadowToneLaw: 'none', shadowToneDepth: 0 })));
    [0.25, 0.5, 0.75, 1].forEach((depth) => {
      const withDepth = JSON.stringify(sPaths(buildShadows({ shadowToneLaw: 'none', shadowToneDepth: depth })));
      expect(withDepth).toBe(base);
    });
  });

  test('control — the same depth sweep DOES change output for the default toneLaw ("ladder"), proving the coupling is specific to "none"', () => {
    const zero = JSON.stringify(sPaths(buildShadows({ shadowToneDepth: 0 })));
    const shipped = JSON.stringify(sPaths(buildShadows({ shadowToneDepth: 0.75 })));
    expect(shipped).not.toBe(zero);
  });
});

/*
 * Params-level contract: `shadowToneDepth` normalization (params.js
 * DEFAULT_SHADOW + normalizeShadow). Bare node require, mirrors the sibling
 * shadowToneLaw whitelist block at the foot of scene3d-shadow-tone-law.test.js.
 */
const Params = require('../../src/core/scene3d/params.js');

describe('Scene3D.Params — shadowToneDepth normalization', () => {
  test('defaults to 0.75 (shipped ON) when the shadow block is absent entirely', () => {
    expect(Params.normalizeShadow(undefined).shadowToneDepth).toBe(0.75);
  });

  test('defaults to 0.75 when shadow is present but shadowToneDepth is not', () => {
    expect(Params.normalizeShadow({ shadowDensity: 70 }).shadowToneDepth).toBe(0.75);
  });

  test('an explicit in-range value survives normalization unchanged', () => {
    expect(Params.normalizeShadow({ shadowToneDepth: 0 }).shadowToneDepth).toBe(0);
    expect(Params.normalizeShadow({ shadowToneDepth: 1 }).shadowToneDepth).toBe(1);
    expect(Params.normalizeShadow({ shadowToneDepth: 0.42 }).shadowToneDepth).toBe(0.42);
  });

  test('out-of-range values clamp into [0,1]; non-numeric strings fall back to the default', () => {
    expect(Params.normalizeShadow({ shadowToneDepth: -3 }).shadowToneDepth).toBe(0);
    expect(Params.normalizeShadow({ shadowToneDepth: 3 }).shadowToneDepth).toBe(1);
    expect(Params.normalizeShadow({ shadowToneDepth: 'nope' }).shadowToneDepth).toBe(0.75);
    // `finite()` (this file's shared coercion helper) does `Number(value)`, and
    // `Number(null) === 0` is finite — so `null` clamps to 0, it does not fall
    // back to the default. That is the SAME behaviour every sibling numeric
    // shadow field already has (e.g. shadowFalloff/shadowDensity clamp a null
    // to their range floor, they do not special-case it) — this pins the
    // established convention, not a new one.
    expect(Params.normalizeShadow({ shadowToneDepth: null }).shadowToneDepth).toBe(0);
  });

  test('round-trips through the full normalizeParams -> object.shadow chain', () => {
    const p = Params.normalizeParams({ objects: [{ primitive: 'box' }], shadow: { shadowToneDepth: 0.1 } });
    expect(p.shadow.shadowToneDepth).toBe(0.1);
  });
});
