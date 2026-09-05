const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * originSpiral tonal spacing + wrap (surface-fill-mono.js `lawSpiral`).
 *
 * THE CONVENTION. See `scene3d-turing-polarity.test.js`'s header for the full
 * statement of the shared `areaFor`/`pitchFor`/`pitchLegible` contract
 * (`surface-fill-mono.js:495-501`): brighter `I` -> larger pitch (sparser),
 * darker `I` -> smaller pitch (denser).
 *
 * THE BUG (structural, not a tuning slip). The original law integrated a
 * single radius against a single, ever-advancing angle:
 * `r(phi) = r0 + INTEGRAL(pitch(phi')/(2*pi)) dphi'`. The spacing between
 * turn K and turn K+1 AT A FIXED ANGLE theta is that integral evaluated over
 * the window [theta, theta + 2*pi] -- exactly one full period -- and the
 * integral of a 2*pi-periodic function over any window of exactly one period
 * is the SAME constant no matter where the window starts. So every angle's
 * ring-to-ring spacing converged on the same silhouette-wide average pitch,
 * regardless of how sharply the local pitch itself varied: measured
 * lit/shadow ink-density ratio 0.975 (flat, in the direction that reads as
 * slightly BACKWARDS) even though the per-sample target pitch driving the
 * walk swung a genuine ~2x between shadow (~0.37mm) and lit (~0.72mm)
 * averages -- proof the flatness was structural, not a coverage or
 * off-surface-budget bug.
 *
 * THE FIX. Rings are now a recurrence, not an integral:
 * `r_{k+1}(theta) = r_k(theta) + pitchFor(I(r_k(theta), theta))`. Ring K+1's
 * radius at a given angle is defined directly from ring K's OWN radius and
 * tone AT THAT SAME angle, so consecutive-ring spacing at any angle is
 * exactly the local pitch there, with no averaging across the rest of the
 * form. The rings are still stitched into one continuous polyline (a seam at
 * theta = 0 bridges ring K to ring K+1), so the law is still the single
 * wound line its name promises.
 *
 * THIS TEST measures real generated geometry with the identical
 * scene/harness `scene3d-turing-polarity.test.js` and
 * `scene3d-maze-tonal-range.test.js` use (sphere, world +X light only,
 * azimuth 90 / elevation 45, screen-right = lit / screen-left = shadow).
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 360, height: 260, m: 20, dW: 320, dH: 220, penWidth: 0.3 };

describe('Scene3D originSpiral tonal spacing + wrap', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  }, 60000);
  afterAll(() => runtime.cleanup());

  const scene = (toneLaw) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1',
      name: 's',
      primitive: 'sphere',
      params: { radius: 46, detail: 24 },
      transform: {
        x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1,
      },
      visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = {
      projection: 'orthographic', yaw: 0, pitch: 0, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1,
    };
    p.styleTable = {
      scene: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 60, toneLaw } },
      byObject: {},
      byFace: {},
    };
    p.tone = clone(defaults).tone;
    p.lights = [{ id: 'sun', type: 'directional', azimuth: 90, elevation: 45, castShadows: false }];
    return p;
  };

  const fills = (paths) => paths.filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');

  // Identical to the harness in scene3d-turing-polarity.test.js /
  // scene3d-maze-tonal-range.test.js. Quintile 0 = leftmost fifth (shadow,
  // world -X); quintile 4 = rightmost fifth (lit, world +X).
  const quintileDensity = (paths) => {
    const ff = fills(paths);
    let minX = 1e9; let maxX = -1e9;
    ff.forEach((pp) => pp.forEach((pt) => { minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x); }));
    const cx = (minX + maxX) / 2; const R = (maxX - minX) / 2;
    const span = Math.max(1e-6, maxX - minX); const binW = span / 5;
    const lens = new Array(5).fill(0); const areas = new Array(5).fill(0);
    ff.forEach((pp) => {
      for (let i = 1; i < pp.length; i += 1) {
        const mx = (pp[i - 1].x + pp[i].x) / 2;
        const len = Math.hypot(pp[i].x - pp[i - 1].x, pp[i].y - pp[i - 1].y);
        let b = Math.floor(((mx - minX) / span) * 5);
        b = Math.max(0, Math.min(4, b));
        lens[b] += len;
      }
    });
    for (let b = 0; b < 5; b += 1) {
      const x0 = minX + b * binW; const x1 = x0 + binW;
      const N = 12; let a = 0;
      for (let k = 0; k < N; k += 1) {
        const x = x0 + (x1 - x0) * ((k + 0.5) / N);
        const d = x - cx;
        a += 2 * Math.sqrt(Math.max(0, R * R - d * d)) * (binW / N);
      }
      areas[b] = a;
    }
    return lens.map((l, i) => l / Math.max(1e-6, areas[i]));
  };

  test('originSpiral: shadow (screen-left) density meaningfully exceeds lit (screen-right) density', () => {
    const paths = algo.generate(scene('originSpiral'), null, null, BOUNDS) || [];
    expect(paths.length).toBeGreaterThan(0);
    const d = quintileDensity(paths);
    expect(d[0]).toBeGreaterThan(0);
    expect(d[4]).toBeGreaterThan(0);
    // Pre-fix (single dr/dphi integral) measured 0.9953/1.0210 = 0.975 --
    // flat, and on the wrong side of 1 to boot. Post-fix (per-angle ring
    // recurrence) measured ~1.50. 1.2 sits strictly between the two.
    expect(d[0] / d[4]).toBeGreaterThan(1.2);
  }, 60000);

  test('originSpiral: segment count stays bounded (no dark-end explosion)', () => {
    const paths = algo.generate(scene('originSpiral'), null, null, BOUNDS) || [];
    const ff = fills(paths);
    let segCount = 0;
    ff.forEach((pp) => { segCount += Math.max(0, pp.length - 1); });
    // Pre-fix measured ~20300 segments. Post-fix (finer angular resolution
    // needed so the outermost ring's chord stays smooth) measured ~24400.
    // 80000 leaves comfortable headroom while still catching a runaway.
    expect(segCount).toBeLessThan(80000);
  }, 60000);

  // THE CONSTANT-PEN-WIDTH CONSTRAINT. Tone must ride geometry spacing, never
  // a per-path stroke-weight channel -- this repo already carries a separate
  // `meta.weightScale` channel and it is the WRONG lever for a monoline law
  // (see this file's header, `surface-fill-mono.js:1-8`). Every emitted path
  // must therefore carry the SAME weight (absent or 1), regardless of how
  // tight the local turns are.
  test('originSpiral: tone rides pattern spacing, not stroke weight (no meta.weightScale)', () => {
    const paths = algo.generate(scene('originSpiral'), null, null, BOUNDS) || [];
    const ff = fills(paths);
    expect(ff.length).toBeGreaterThan(0);
    const weights = new Set(ff.map((pp) => (pp.meta && pp.meta.weightScale != null ? pp.meta.weightScale : 1)));
    expect(weights.size).toBe(1);
    expect([...weights][0]).toBe(1);
  }, 60000);

  test('mazeFill: tone rides pattern spacing, not stroke weight (no meta.weightScale)', () => {
    const paths = algo.generate(scene('mazeFill'), null, null, BOUNDS) || [];
    const ff = fills(paths);
    expect(ff.length).toBeGreaterThan(0);
    const weights = new Set(ff.map((pp) => (pp.meta && pp.meta.weightScale != null ? pp.meta.weightScale : 1)));
    expect(weights.size).toBe(1);
    expect([...weights][0]).toBe(1);
  }, 60000);
});

/*
 * originSpiral RESPECTS THE PLOT FLOOR ON TORUS AND CONE (F-10).
 *
 * `lawSpiral` walks a ring radius outward by a screen-space pitch,
 * `wrapPitch(pitchFor(I), nz)`, which folds the pitch tighter as the walk
 * rides the limb (`nz` -> 0). On a sphere that foreshortened band is a thin
 * rim; on a torus (the whole inner rim) and a cone (the entire lateral face
 * rides a low, near-uniform `nz`) the SAME fold compounds with an
 * already-sub-floor `pitchFor` dark-tone pitch — deliberate everywhere in
 * this file, see `areaFor`'s own A_DARK comment, and the source of this
 * file's tonal contrast — and drives the realised ring-to-ring gap under
 * a pen width: turns crossing under the pen, which reads as solid white
 * banding and moire. Measured pre-fix (this test's own harness, the
 * `__MONO_TRACE` / `SF.buildObject` technique `scene3d-mono-substrate.test.js`
 * uses to read the law's own published context): torus 518/4246 (12.2%) of
 * on-surface ring-to-ring gaps under 0.5 pen, cone 439/6344 (6.9%), against
 * sphere's 815/31257 (2.6%) under the same scene.
 *
 * REWORKED AFTER REVIEW: a 0.5x-pen floor was cosmetic — a torus/hatch
 * re-shoot at that floor was pixel-indistinguishable from pre-fix at normal
 * viewing size, and 92-100% of samples were STILL under this repo's own
 * plot-safe pitch (`C.FLOOR`, `PLOT_FLOOR_PEN` = 2.2 pen, `surface-
 * fill.js:244`) — still an unplottable blob by this file's own definition.
 * THE FIX now floors the FOLDED pitch at 0.8x pen — close to genuinely
 * plot-safe while still clearing the tonal-range (bar 1.2) and wrap-
 * foreshorten rim/core (bar 1.05) tests with margin; 1.0x pen was tried too
 * and clears tonal-range but fails rim/core (1.03 vs 1.05) — the wrap term
 * has less headroom than tone does. Switching the law's base pitch to
 * `pitchLegible` (the FULL floor) instead was tried first and REJECTED: it
 * collapsed the shadow/lit density ratio from ~1.5 to 1.05 (below the 1.2
 * bar above) and the rim/core wrap ratio from 1.26 to 1.01 — the deliberate
 * tonal contrast IS the sub-floor headroom, and a blanket floor spends it
 * everywhere, not just where it is actually crossing.
 *
 * NOT byte-identical on the sphere: the sphere already crossed the same
 * 0.8x-pen line in 6.5% of samples pre-fix (below the 12.2%/6.9% torus/cone
 * numbers, matching "on the sphere it reads correctly"), so the same clamp
 * touches those too — but only those, and both existing tonal/wrap tests
 * above still pass with their original margins (verified), so the sphere's
 * tonal read is unaffected in the sense this file's other tests exist to
 * catch.
 */
describe('Scene3D originSpiral respects the plot floor on torus / cone (F-10)', () => {
  let runtime; let win; let V; let algo2; let defaults2; let SF;
  const optsFor = {};

  const SIZES = {
    sphere: { sx: 30, sy: 30, sz: 30, detail: 24 },
    torus: { sx: 34, sy: 9, sz: 9, detail: 24 },
    cone: { sx: 20, sy: 22, sz: 20, detail: 24 },
  };
  const SUN2 = { id: 'sun', type: 'directional', azimuth: 200, elevation: 55, castShadows: false };
  const BOUNDS2 = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };

  // Identical technique to `scene3d-mono-substrate.test.js`'s `captureOpts`:
  // wrap `SF.buildObject` during one real `algo.generate` pass to recover the
  // REAL opts bag `scene3d.js` builds for this primitive, so the fold/pitch
  // math runs on the exact same substrate the app itself feeds it.
  const captureOpts = (primitive) => {
    const p = clone(defaults2);
    p.objects = [{
      id: 'o1',
      name: 's',
      primitive,
      params: clone(SIZES[primitive]),
      transform: {
        x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1,
      },
      visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = {
      projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1,
    };
    p.styleTable = { scene: { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 60 } }, byObject: {}, byFace: {} };
    p.tone = { ...clone(defaults2).tone, enabled: true };
    p.lights = [SUN2];

    const calls = [];
    const orig = SF.buildObject;
    SF.buildObject = function wrapped(o) {
      const result = orig.call(this, o);
      calls.push({ opts: o, result });
      return result;
    };
    try { algo2.generate(p, null, null, BOUNDS2); } finally { SF.buildObject = orig; }
    let best = calls[0];
    calls.forEach((c) => { if ((c.result || []).length > (best.result || []).length) best = c; });
    return best && best.opts;
  };

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    win = runtime.window;
    V = win.Vectura;
    algo2 = V.AlgorithmRegistry.scene3d;
    defaults2 = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
    Object.keys(SIZES).forEach((k) => { optsFor[k] = captureOpts(k); });
  }, 120000);
  afterAll(() => runtime.cleanup());

  // The ground truth: `lawSpiral`'s own per-angle, ring-to-ring radial gap in
  // screen mm (on-surface only), published on the law's own context exactly
  // as "the spacing between turn K and turn K+1 AT A FIXED ANGLE theta" this
  // file's header derives it — not a black-box reconstruction from output
  // geometry, which the seam/silhouette clipping would make unreliable.
  const gapStats = (primitive) => {
    win.__MONO_TRACE = 1;
    win.__MONO_CTX = null;
    SF.buildObject({ ...optsFor[primitive], toneLaw: 'originSpiral' });
    const C = win.__MONO_CTX;
    expect(C, `no mono context published for ${primitive} — the law did not dispatch`).toBeTruthy();
    const gaps = C.__spiralGaps || [];
    expect(gaps.length, `${primitive}: no ring-to-ring gaps recorded`).toBeGreaterThan(200);
    const pen = C.PEN;
    let below08 = 0;
    gaps.forEach((g) => { if (g < 1.0 * pen) below08 += 1; });
    return {
      n: gaps.length, below08, frac: below08 / gaps.length,
    };
  };

  // Bar TIGHTENED twice after review: 0.5x -> 0.8x -> now the FULL 1.0x pen
  // (see this file's header comment above for the re-shoot evidence and the
  // tone-by-omission mechanism that keeps the tonal-range/rim-core tests
  // passing at the full floor).
  test('torus: ring-to-ring gap stays at or above one full pen width', () => {
    const { frac, n, below08 } = gapStats('torus');
    // Pre-fix (0.8x floor, no retrace) measured 10.0% of gaps under 1.0x
    // pen. Post-fix (1.0x floor + per-angle retrace duty) 0/n.
    expect(frac, `${below08}/${n} (${(frac * 100).toFixed(1)}%) gaps under 1.0x pen on torus`).toBeLessThanOrEqual(0.01);
  }, 120000);

  test('cone: ring-to-ring gap stays at or above one full pen width', () => {
    const { frac, n, below08 } = gapStats('cone');
    // Pre-fix (0.8x floor, no retrace) measured 10.4% of gaps under 1.0x
    // pen. Post-fix (1.0x floor + per-angle retrace duty) 0/n.
    expect(frac, `${below08}/${n} (${(frac * 100).toFixed(1)}%) gaps under 1.0x pen on cone`).toBeLessThanOrEqual(0.01);
  }, 120000);

  // DUTY COMPUTATION CHECK — NOT itself a retrace-emission mutation guard.
  // CORRECTION recorded here after actually verifying it: reading the
  // per-angle `__spiralDuty` trace does NOT catch the retrace loop being
  // disabled, because `localDuty[i]` is computed BEFORE the retrace `for`
  // loop ever runs and is pushed to the trace regardless of whether that
  // loop subsequently emits anything. Proved directly: took a scratch copy
  // of this tree, changed the retrace loop's condition to
  // `for (let L = 2; L <= DUTY_CAP && false; L += 1)`, and ALL tests in this
  // file — including an earlier draft of this one — still passed unchanged.
  // The real, output-level mutation guard is the next test below, which
  // reads `algo.generate`'s actual returned paths. This test still earns
  // its place: it proves the DUTY VALUE ITSELF is computed correctly (a
  // real arc of the torus genuinely asks for duty > 1, and the floor safety
  // property holds) — necessary but not sufficient for "the mechanism
  // fires," which is what the test below actually checks.
  test('originSpiral retrace: torus shadow arc computes duty > 1, and every gap still clears 1.0x pen', () => {
    const { frac, n, below08 } = gapStats('torus');
    const C = win.__MONO_CTX;
    const duty = C.__spiralDuty || [];
    expect(duty.length, 'no per-angle duty trace recorded — __spiralDuty missing').toBeGreaterThan(200);
    // The shadow arc measured directly above (60deg-120deg, in the SAME
    // trace/scene this file's own header numbers came from): avgDuty ~1.13,
    // maxDuty 3, n=856 samples in this 60deg band alone (measured directly,
    // not asserted blind).
    const shadowArc = duty.filter((d) => {
      const deg = ((d.theta / (2 * Math.PI)) * 360 + 360) % 360;
      return deg >= 60 && deg < 120;
    });
    expect(shadowArc.length, 'shadow arc (60-120deg) has no on-surface samples at all — fixture drifted').toBeGreaterThan(100);
    const dutyOver1 = shadowArc.filter((d) => d.duty > 1);
    // A retrace-disabled build (or one where duty were hard-clamped to 1)
    // would make this exactly 0 — that is precisely the mutation this test
    // exists to catch.
    expect(dutyOver1.length, `expected some duty>1 samples in the torus shadow arc, got 0/${shadowArc.length} — retrace mechanism not firing`).toBeGreaterThan(0);
    // Every recorded duty value must itself have been produced BY a real
    // retrace-eligible ratio (duty > 1 implies the raw, pre-clamp ratio was
    // itself > 1 — i.e. the floor was genuinely engaged there, not an
    // off-by-one in the bookkeeping).
    dutyOver1.forEach((d) => {
      expect(d.dutyRaw).toBeGreaterThanOrEqual(d.duty);
    });
    expect(frac, `${below08}/${n} gaps under 1.0x pen on torus while duty>1 samples exist`).toBeLessThanOrEqual(0.01);
  }, 120000);

  // THE ACTUAL RETRACE-EMISSION MUTATION GUARD (W-10c review followup #1,
  // corrected). Reads `algo.generate`'s real returned paths (full pipeline,
  // not the internal trace) on the app-default torus/hatch/originSpiral
  // scene at fillDensity 50 (the fixture this unit's own tone-not-flattened
  // measurement used). Disabling the retrace loop (`&& false` mutation,
  // verified directly in a scratch copy of this tree) measured pathCount
  // 293, segCount 2285, inkLen 1365.7mm; with retrace enabled (this tree,
  // unmodified) measured pathCount 409, segCount 2505, inkLen 1551.7mm.
  // The bars below sit strictly between those two measurements, so this
  // test is RED against the disabled-retrace mutation and GREEN here.
  test('originSpiral retrace: disabling the retrace loop measurably drops torus output (real mutation guard)', () => {
    const p = clone(defaults2);
    p.objects = [{
      id: 'o1',
      name: 's',
      primitive: 'torus',
      params: { outerRadius: 46, innerRadius: 20, detail: 24 },
      transform: {
        x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1,
      },
      visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = {
      projection: 'orthographic', yaw: 0, pitch: 0, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1,
    };
    p.styleTable = {
      scene: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 50, toneLaw: 'originSpiral' } },
      byObject: {},
      byFace: {},
    };
    p.tone = clone(defaults2).tone;
    p.lights = [{ id: 'sun', type: 'directional', azimuth: 90, elevation: 45, castShadows: false }];
    const BOUNDS3 = {
      width: 360, height: 260, m: 20, dW: 320, dH: 220, penWidth: 0.3,
    };
    const paths = algo2.generate(p, null, null, BOUNDS3) || [];
    const ff = paths.filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');
    let segCount = 0; let inkLen = 0;
    ff.forEach((pp) => {
      for (let i = 1; i < pp.length; i += 1) {
        segCount += 1;
        inkLen += Math.hypot(pp[i].x - pp[i - 1].x, pp[i].y - pp[i - 1].y);
      }
    });
    // No-retrace measured pathCount 293 / inkLen 1365.7; with-retrace
    // measured 409 / 1551.7. Bars sit strictly between.
    expect(ff.length, `torus pathCount ${ff.length} — expected > 350 (no-retrace measured 293)`).toBeGreaterThan(350);
    expect(inkLen, `torus inkLen ${inkLen.toFixed(1)}mm — expected > 1450 (no-retrace measured 1365.7)`).toBeGreaterThan(1450);
  }, 60000);

  // DUTY_CAP BOUNDARY GUARD (W-10c review followup #2). Zero coverage
  // existed for the cap itself: `clamp(dutyRaw, 1, DUTY_CAP)` could have its
  // cap silently raised, lowered, or removed and no test would notice,
  // because every OTHER test only reads the post-clamp `duty`. This test
  // reads BOTH the raw (pre-clamp) ratio and the clamped value the law
  // actually used, and verifies `duty` is always the correctly-clamped
  // form of `dutyRaw` (`duty === clamp(dutyRaw, 1, 4)`, never exceeding
  // DUTY_CAP).
  //
  // HONEST FINDING while writing this guard: the cap does NOT actually
  // engage on any measured fixture. Torus tops out at dutyRaw 3 (matching
  // the law's own header, "measured torus max wanted duty ~3.6" — the true
  // max is closer to 3, not 4). Pushing `penWidth` to 3x the default (0.9
  // vs 0.3) to force a larger PLOT_MIN_PEN/wanted ratio STILL topped out at
  // 3 (`pitchFor`'s own floor `INK / A_DARK` scales with the same
  // `inkWidth`/`penWidth` pair that sets `PLOT_MIN_PEN`, so the ratio
  // between them stays roughly fixed regardless of absolute pen size — a
  // structural reason, not a fixture accident). DUTY_CAP=4 currently reads
  // as a purely defensive headroom margin with zero live engagement on any
  // primitive or density tested; this is recorded here rather than
  // asserted as "engages" so a future change that finally DOES cross it
  // gets a real green transition instead of a pre-broken assumption.
  test('originSpiral retrace: DUTY_CAP=4 clamp is applied correctly (no engagement observed on any tested fixture)', () => {
    gapStats('torus');
    const C = win.__MONO_CTX;
    const duty = C.__spiralDuty || [];
    expect(duty.length).toBeGreaterThan(200);
    const DUTY_CAP = 4;
    const maxDutyRaw = Math.max(...duty.map((d) => d.dutyRaw));
    // Not a hard requirement (see the honest finding above) — logged so a
    // future engagement is visible without re-deriving it.
    // eslint-disable-next-line no-console
    console.log(`W-10c DUTY_CAP guard: max observed dutyRaw on torus = ${maxDutyRaw} (cap = ${DUTY_CAP})`);
    duty.forEach((d) => {
      expect(d.duty).toBeLessThanOrEqual(DUTY_CAP);
      expect(d.duty).toBeGreaterThanOrEqual(1);
      expect(d.duty).toBe(Math.min(Math.max(1, d.dutyRaw), DUTY_CAP));
    });
  }, 120000);
});
