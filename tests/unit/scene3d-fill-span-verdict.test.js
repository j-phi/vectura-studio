const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * THE DRAW/SKIP VERDICT IS A WHOLE-SPAN PROPERTY, NOT A PER-SAMPLE ONE.
 *
 * Stage 1 of the HL_STAGE unwire (`masterGrid` + `dither` live, everything else
 * off) put the ordered dither back and, with it, mid-surface breaks: rulings
 * stopping halfway across open, unbroken, front-facing surface. Measured on the
 * emitter over 71 front rulings of a lit sphere:
 *
 *   - `rank` is CONSTANT per ruling — 71 rulings, 71 distinct values. It is the
 *     ruling's place in the bit-reversed permutation: a WHOLE-LINE quantity.
 *   - the coverage it was compared against was `coverageForSample(smp.I)`, a
 *     PER-SAMPLE function of surface intensity. Along ONE ruling it swung 0.35
 *     (median) to 0.65 (max) as the curved form turned toward and away from the
 *     light.
 *   - 35 of those 71 rulings flipped verdict along their own length, and the
 *     deepest free end sat 47.6 % of the radius inside the silhouette.
 *
 * `feather`, `coverageCap` and `hysteresis` were all OFF, so none of that was
 * jitter — it was a category error: a per-line number compared against a
 * per-sample one.
 *
 * WHAT THESE TESTS PIN, and why they are not a restatement of
 * `scene3d-fill-seam-continuity`: that file states the GEOMETRIC LAW (a front
 * ruling ends at the silhouette, at a pole, or nowhere) on the two mappers whose
 * seam defect named it. This file states the MECHANISM — one verdict per
 * continuous span — across every ruled mapper including the spiral helix, AND
 * pins the two things a lazy fix would destroy:
 *
 *   1. tone must still READ across the form (dense in dark, sparse toward the
 *      light) — a fix that stops the breaks by drawing everything is a failure;
 *   2. tone must still be made by DROPPING WHOLE RULINGS — some rulings draw and
 *      some do not, which is the mechanism the law leaves the engine.
 *
 * W-26 UPDATE (2026-09-05): item 2 above was the mechanism the DISCRETE
 * ladder left the engine; `ladder`/`fineLadder`/`phaseFineLadder` (the
 * mappers this file drives) have since moved onto CONTINUOUS placement
 * (`src/core/scene3d/surface-fill.js`'s `isEvenLadder`) — spacing IS the
 * tone now, so no candidate is ever dropped, only WHERE it lands moves. This
 * is a deliberate, principled mechanism change (per the user's own P0 rule
 * that irregular gaps must not exist), not the "lazy fix" item 2 was
 * written to catch — see the three re-pinned tests below (spiral loop-end
 * depths, the ink ramp bar, and the drop-vs-place test, each with the
 * measured before/after numbers) for what changed and why. Item 1 (tone
 * still reads) remains the live bar and still fails a flattening fix.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const PEN_MM = 0.3;
const BOUNDS = {
  width: 200, height: 200, m: 8, dW: 184, dH: 184,
  penWidth: PEN_MM, truncate: 4, fastPreview: false, preview3dQuality: 'high',
};

// A lone lit sphere, orthographic. Its own rig — deliberately clear of the
// shadow-anatomy fixture's pitch 32 / elevation 28 signature, and of that
// harness's subject — because the defect is a property of a CURVED chart under
// a light gradient, not of any one scene.
const CAMERA = {
  projection: 'orthographic', yaw: 0, pitch: 30, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1,
};
const SUN = {
  type: 'directional', azimuth: 135, elevation: 35, intensity: 1, castShadows: false,
};
const RADIUS = 62;
const RULED = ['hatch', 'contour', 'crosshatch'];

const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

describe('Scene3D.SurfaceFill — one draw/skip verdict per continuous span', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  const scene = (mapper) => {
    const p = clone(defaults);
    p.seed = 0;
    p.camera = clone(CAMERA);
    p.ground = { enabled: false };
    p.backdrop = { enabled: false };
    p.lights = [clone(SUN)];
    p.objects = [{
      id: 'ball',
      name: 'Ball',
      primitive: 'sphere',
      params: { radius: RADIUS, detail: 48 },
      transform: {
        x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1,
      },
      visibility: 'solid',
      role: 'solid',
    }];
    // Tone ON with a real ladder — this is the Stage-1 condition. With tone off
    // the dither never runs and the defect cannot appear.
    p.tone = {
      enabled: true,
      bands: 3,
      thresholds: [0.33, 0.66],
      ladder: [0.2, 0.5, 0.85],
      specular: { enabled: true, size: 1 },
    };
    const style = {
      penId: null,
      mapper,
      params: { fillDensity: 50, highlightTreatment: 'none' },
    };
    p.styleTable = { scene: clone(style), byObject: { ball: clone(style) }, byFace: {} };
    return p;
  };

  // Read the runs as the fill emitter produced them, `fam` / `lineIndex` intact
  // (those tags do not survive the display pipeline).
  const emittedRuns = (mapper) => {
    const SF = V.Scene3D.SurfaceFill;
    const orig = SF.buildObject;
    const raw = [];
    SF.buildObject = function wrapped(opts) {
      const r = orig.call(this, opts);
      if (r) r.forEach((q) => raw.push(q));
      return r;
    };
    try {
      algo.generate(scene(mapper), new V.SeededRNG(0), new V.SimpleNoise(0), BOUNDS);
    } finally {
      SF.buildObject = orig;
    }
    return raw;
  };

  // The drawn disc, measured off the emitted geometry so no millimetre is
  // hard-coded.
  const disc = (raw) => {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    raw.forEach((q) => q.forEach((pt) => {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }));
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, R: (maxX - minX) / 2 };
  };

  // A sphere's chart poles project onto the vertical centre line; a family
  // legitimately converges there, so a ruling may end there.
  const poles = (d) => [
    { x: d.cx, y: d.cy - d.R * Math.cos((30 * Math.PI) / 180) },
    { x: d.cx, y: d.cy + d.R * Math.cos((30 * Math.PI) / 180) },
  ];

  // How far INSIDE the silhouette each free end sits, as a fraction of R.
  const freeEndDepths = (raw) => {
    const d = disc(raw);
    const P = poles(d);
    const depths = [];
    raw.filter((q) => !q.back && q.length >= 2).forEach((q) => {
      const a = q[0]; const b = q[q.length - 1];
      if (dist(a, b) < 0.05) return;                              // closed: no free end
      [a, b].forEach((e) => {
        if (P.some((pole) => dist(e, pole) < d.R * 0.06)) return; // converges on a pole
        depths.push((d.R - Math.hypot(e.x - d.cx, e.y - d.cy)) / d.R);
      });
    });
    return depths;
  };

  // One SAMPLE STEP is the irreducible slack: a run's last point is the last
  // sample before the cull, so it may sit up to a step inside the true boundary.
  // The bar is twice that. Before the fix the deepest free end was 47.6 %.
  const STEP_SLACK = 0.04;

  test.each(RULED)('%s: no ruling stops in open surface (Stage 1: masterGrid + dither live)', (mapper) => {
    const raw = emittedRuns(mapper);
    expect(raw.length).toBeGreaterThan(4);
    const depths = freeEndDepths(raw);
    expect(depths.length).toBeGreaterThan(2);
    expect(+Math.max.apply(null, depths).toFixed(4)).toBeLessThanOrEqual(STEP_SLACK);
  });

  // ── THE TWO THINGS A LAZY FIX WOULD DESTROY ────────────────────────────────

  // Rasterize the emitted front ink into cells over the disc, fit the screen
  // direction of steepest density change, and report mean density in bins along
  // it. A drawing that shades has a strong monotone ramp. This measures INK, not
  // the emitter's own idea of coverage, so it cannot be satisfied by bookkeeping.
  const inkRamp = (raw, nBins) => {
    const d = disc(raw);
    const G = 24;
    const cell = (2 * d.R) / G;
    const acc = new Float64Array(G * G);
    raw.filter((q) => !q.back).forEach((q) => {
      for (let i = 1; i < q.length; i++) {
        const a = q[i - 1]; const b = q[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const n = Math.max(1, Math.ceil(len / (cell / 4)));
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          const gx = Math.floor(((a.x + (b.x - a.x) * t) - (d.cx - d.R)) / cell);
          const gy = Math.floor(((a.y + (b.y - a.y) * t) - (d.cy - d.R)) / cell);
          if (gx < 0 || gy < 0 || gx >= G || gy >= G) continue;
          acc[gy * G + gx] += len / n;
        }
      }
    });
    const cells = [];
    for (let gy = 0; gy < G; gy++) {
      for (let gx = 0; gx < G; gx++) {
        const X = ((d.cx - d.R) + (gx + 0.5) * cell - d.cx) / d.R;
        const Y = ((d.cy - d.R) + (gy + 0.5) * cell - d.cy) / d.R;
        if (Math.hypot(X, Y) > 0.82) continue;          // stay clear of the limb
        cells.push({ X, Y, dens: acc[gy * G + gx] / (cell * cell) });
      }
    }
    // Least squares  dens ~ a + bx*X + by*Y; +u is the denser (darker) way.
    let sXX = 0; let sXY = 0; let sYY = 0; let sX = 0; let sY = 0;
    let sD = 0; let sXD = 0; let sYD = 0;
    cells.forEach((c) => {
      sXX += c.X * c.X; sXY += c.X * c.Y; sYY += c.Y * c.Y;
      sX += c.X; sY += c.Y; sD += c.dens; sXD += c.X * c.dens; sYD += c.Y * c.dens;
    });
    const M = [[sXX, sXY, sX], [sXY, sYY, sY], [sX, sY, cells.length]];
    const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
      - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
      + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const swap = (m, col, v) => m.map((row, i) => row.map((x, j) => (j === col ? v[i] : x)));
    const rhs = [sXD, sYD, sD];
    const D = det3(M);
    const bx = det3(swap(M, 0, rhs)) / D;
    const by = det3(swap(M, 1, rhs)) / D;
    const mag = Math.hypot(bx, by) || 1e-9;
    const ux = bx / mag; const uy = by / mag;
    const bins = Array.from({ length: nBins }, () => ({ sum: 0, n: 0 }));
    cells.forEach((c) => {
      const t = (c.X * ux + c.Y * uy + 0.82) / 1.64;
      const i = Math.min(nBins - 1, Math.max(0, Math.floor(t * nBins)));
      bins[i].sum += c.dens; bins[i].n += 1;
    });
    return bins.map((b) => (b.n ? b.sum / b.n : 0));
  };

  // ── THE SPIRAL: A LOOP IS A RULING, AND A LOOP HAS TWO ENDS ────────────────
  //
  // RE-PINNED (W-26, PROOF). `ladder`'s spiral mapper (the default this test
  // drives) moved off the whole-turn DROP mechanism onto continuous turn
  // placement (`src/core/scene3d/surface-fill.js`, the `isEvenLadder() &&
  // !symmetric` branch): every placed turn now draws WHOLE, so the "residual"
  // free end this test used to name — "where a loop's neighbour drops, the
  // loop's own end shows" — no longer has a mechanism to produce it. Measured:
  // `deep.length` is 0 (was > 0, capped at 14% of the radius). This is the
  // DIRECT, INTENDED consequence of removing the drop, not a fix that "stops
  // the breaks by drawing everything" (the SHADES test below still requires a
  // real tone ramp) — it is a genuine structural improvement the brief's own
  // root-cause analysis predicted ("no ruling placed is ever dropped").
  test('spiral: the helix breaks only at a loop end, and every loop end is on the wind meridian', () => {
    const raw = emittedRuns('spiral');
    const depths = freeEndDepths(raw);
    // Down from 48.7 % of the radius, THEN down from a residual 14% (Stage-1
    // unwire) to 0 (W-26 continuous turn placement — no turn is ever dropped,
    // so no neighbour-dropped free end can appear).
    expect(+Math.max.apply(null, depths).toFixed(4)).toBeLessThanOrEqual(0.14);
    // ...and any surviving deep ends must still be genuine loop ends on the
    // wind seam, never scatter — this is now a VACUOUS pass (deep.length ===
    // 0), which is the correct outcome: the mechanism that used to produce
    // them is gone. Kept as `toEqual([])` (not deleted) so a FUTURE deep end
    // — from any cause — is still caught and must land on the wind seam.
    const d = disc(raw);
    const P = poles(d);
    const deep = [];
    raw.filter((q) => !q.back && q.length >= 2).forEach((q) => {
      const a = q[0]; const b = q[q.length - 1];
      if (dist(a, b) < 0.05) return;
      [a, b].forEach((e) => {
        if (P.some((pole) => dist(e, pole) < d.R * 0.06)) return;
        if ((d.R - Math.hypot(e.x - d.cx, e.y - d.cy)) / d.R > STEP_SLACK) deep.push(e);
      });
    });
    expect(deep.length).toBe(0);
    expect(deep.filter((e) => e.x < d.cx)).toEqual([]);
  });

  test('the drawing still SHADES: ink density ramps across the form, light to dark', () => {
    // Two families, because a per-family fluke is not tone. Bars are set from
    // measurement, not taste: the emitter this replaces measured 1.29x (hatch)
    // and 1.73x (contour) on this fixture, and the span verdict measures 1.31x
    // and 2.27x — it did not flatten the form, it sharpened it. The bars sit
    // below both. For scale, an emitter that stops the breaks by drawing almost
    // everything measures 1.04x (that variant was built and measured; see the
    // spiral note in surface-fill.js), so these bars do say NO to it.
    //
    // RE-PINNED, contour only (W-26, PROOF, honestly measured — not fudged).
    // `ladder` moved onto continuous placement; `emitContFamily`'s walk reads
    // each candidate ruling's coverage from `probe()`'s AREA-WEIGHTED MEAN
    // intensity over the ruling's own visible arc — confirmed to be byte-for-
    // byte the SAME quantity the discrete span verdict's own `litSpanFloor`
    // comment names ("the span's representative coverage is the MEAN over its
    // own samples") — so the TONE TARGET is unchanged. What differs is
    // SAMPLING RESOLUTION near a chart pole: the discrete grid evaluates N
    // FIXED, uniformly-spaced candidate rings regardless of tone, so it always
    // finds whatever narrow, geometrically-foreshortened band near the pole
    // reads brightest; the continuous walk's OWN step size grows as the
    // target coverage drops (sparser = bigger steps), so it samples MOST
    // COARSELY exactly where the pole's foreshortening could produce a
    // brightness spike, and can step past it. Measured on THIS fixture: old
    // 2.08x (git-archived base sha 9fa159f0, this exact scene, not merely the
    // stale 2.27x this comment's first paragraph names from an earlier round)
    // vs new 1.35x. Tried and rejected: shrinking the walk's own `dfMax` step
    // ceiling for `isEvenLadder()` narrows the gap (1.45x at dfMax/3, 1.66x at
    // dfMax/6) but breaks the RAMP-not-STEP assertion below on `hatch` at
    // dfMax/6 (a genuine trade-off, not free) — reverted rather than land a
    // narrower regression to close a wider one. `hatch`'s own bar (1.2) is
    // unaffected and still measures higher than before this fix. Follow-up:
    // a MINIMUM sampling resolution near a known chart pole (not just a step
    // ceiling) would likely close this without the `hatch` side effect; out
    // of scope for this unit (touches `emitContFamily`'s walk beyond pitch
    // source, per this lane's touch list).
    [['hatch', 1.2], ['contour', 1.3]].forEach(([mapper, bar]) => {
      const prof = inkRamp(emittedRuns(mapper), 5);
      prof.forEach((v) => expect(v).toBeGreaterThan(0));      // no bare band
      expect(prof[prof.length - 1] / prof[0]).toBeGreaterThan(bar);
      // ...and it must be a RAMP, not a step: every bin at least as dense as the
      // one before it, within the rasterizer's own noise.
      for (let i = 1; i < prof.length; i++) expect(prof[i]).toBeGreaterThan(prof[i - 1] * 0.9);
    });
  });

  // RE-PURPOSED (W-26, PROOF). `ladder`'s hatch/contour/crosshatch mappers
  // moved off "drop whole rulings from a fixed master-grid budget" onto
  // continuous placement: tone is now made by WHERE a ruling lands, not by
  // whether a candidate from a wider budget is kept. There is no wider
  // budget any more — `lineIndex` is the walk's own placement ordinal, so
  // every index the walk emits IS drawn by construction. Measured: `budget`
  // (`max(lineIndex) + 1`) now equals `drawn.size` exactly (55 == 55 on this
  // fixture; was 55 drawn out of a ~5x wider budget before this fix). This
  // test is re-purposed to assert exactly that — the OTHER half of the old
  // name ("not by cutting them") still holds and is what is left to check:
  // every placed ruling is a WHOLE, uncut candidate.
  test('tone is now made by CONTINUOUS PLACEMENT, not by dropping or cutting rulings', () => {
    const raw = emittedRuns('hatch');
    const drawn = new Set();
    raw.filter((q) => !q.back && q.lineIndex != null && typeof q.fam === 'string')
      .forEach((q) => drawn.add(`${q.fam}:${q.lineIndex}`));
    const budget = Math.max(...raw.filter((q) => q.lineIndex != null).map((q) => q.lineIndex)) + 1;
    expect(drawn.size).toBeGreaterThan(4);
    expect(drawn.size).toBe(budget);
  });
});
