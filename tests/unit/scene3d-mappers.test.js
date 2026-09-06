/**
 * 3D Scene Studio — Phase 3 surface-fill mappers (crosshatch / contour / spiral
 * / stipple). Covers the pure Scene3D.Mappers region-fill module, the algorithm
 * dispatch (each mapper emits sceneFill and suppresses the face outline + creases
 * like hatch does), and the params whitelist that keeps the new mapper names.
 *
 * RGR: on the Phase-2 branch the mappers are absent — normalizeParams resets the
 * names to 'none' (0 fills) and Scene3D.Mappers is undefined — so this fails
 * before Phase 3 and passes after.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true, penWidth: 0.3 };

const box = (id, extra = {}) => ({
  id,
  name: id,
  primitive: 'box',
  params: { sx: 40, sy: 40, sz: 40 },
  transform: { x: 0, y: 0, z: 0, yaw: 22, pitch: 0, roll: 0, scale: 1 },
  visibility: 'solid',
  ...extra,
});

describe('3D Scene Studio Phase 3 — surface-fill mappers', () => {
  let runtime;
  let V;
  let algo;
  let defaults;
  let realCascade;
  let P;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry && V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS && V.ALGO_DEFAULTS.scene3d;
    realCascade = V.Scene3D.StyleCascade; // the genuine module (a stub replaces it per-test)
    P = V.Scene3D.Params;
  });
  afterAll(() => runtime.cleanup());
  afterEach(() => { if (V.Scene3D) V.Scene3D.StyleCascade = realCascade; });

  const clone = (o) => JSON.parse(JSON.stringify(o));
  // The shipped default 'solid' primitive — a buckyball — used by the W-25b
  // fingerprint test below. `solidType` defaults to 'buckyball' the same way
  // scripts/audit/scene3d-capture.js resolves it for the gallery's "solid"
  // cell (P.PRIMITIVE_PARAM_DEFAULTS.solid.solidType).
  const solidBuckyball = (id, extra = {}) => ({
    id,
    name: id,
    primitive: 'solid',
    params: { ...(P.PRIMITIVE_PARAM_DEFAULTS.solid || {}), solidType: 'buckyball' },
    transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
    visibility: 'solid',
    ...extra,
  });
  const sceneParams = (mapper, objects) => {
    const p = clone(defaults);
    p.seed = 1;
    p.objects = objects;
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -25, pitch: 20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = { scene: { penId: null, mapper, params: { fillAngle: 0, fillDensity: 50 } }, byObject: {}, byFace: {} };
    return p;
  };

  // Stub cascade (mirrors scene3d-generate) so the dispatch is tested without the
  // params whitelist in the way.
  const installStub = () => {
    V.Scene3D.StyleCascade = {
      resolve(styleTable, { objectId, faceId }) {
        const t = styleTable || {};
        const s = (t.byFace && t.byFace[`${objectId}/${faceId}`]) || (t.byObject && t.byObject[objectId]) || t.scene || {};
        return { penId: s.penId != null ? s.penId : null, mapper: s.mapper || 'none', params: { ...(s.params || {}) }, provenance: { scope: 'test' } };
      },
    };
  };
  const fills = (paths) => paths.filter((p) => p.meta.kind === 'sceneFill');
  const kind = (paths, k) => paths.filter((p) => p.meta.kind === k);

  // ── Pure module ────────────────────────────────────────────────────────────
  describe('Scene3D.Mappers.regionFill (pure)', () => {
    const SQ = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }];

    test('the module is registered', () => {
      expect(V.Scene3D && V.Scene3D.Mappers && typeof V.Scene3D.Mappers.regionFill).toBe('function');
    });

    test('contour emits concentric CLOSED rings, denser as spacing shrinks', () => {
      const M = V.Scene3D.Mappers;
      const coarse = M.regionFill('contour', [SQ], { spacing: 10 });
      const fine = M.regionFill('contour', [SQ], { spacing: 4 });
      expect(coarse.length).toBeGreaterThanOrEqual(1);
      expect(fine.length).toBeGreaterThan(coarse.length);
      // Each ring is a closed polyline (first ≈ last).
      coarse.forEach((r) => {
        expect(r.length).toBeGreaterThanOrEqual(4);
        expect(Math.hypot(r[0].x - r[r.length - 1].x, r[0].y - r[r.length - 1].y)).toBeLessThan(1e-6);
      });
    });

    // Phase 3 contract change: spiral is a TRUE clipped Archimedean spiral (one
    // continuous winding run + boundary arcs), NOT the old stitched concentric
    // rings. The dominant run is the continuous central spiral.
    test('spiral emits a continuous winding run (the true-spiral central pass)', () => {
      const M = V.Scene3D.Mappers;
      const spiral = M.regionFill('spiral', [SQ], { spacing: 5 });
      const contour = M.regionFill('contour', [SQ], { spacing: 5 });
      expect(spiral.length).toBeGreaterThanOrEqual(1);
      const main = spiral.slice().sort((a, b) => b.length - a.length)[0];
      // The central spiral is one long run — many more vertices than a single
      // contour ring (which is just 4 corners of the square).
      expect(main.length).toBeGreaterThan(contour[0].length);
    });

    test('stipple emits small closed dots, more of them as spacing shrinks', () => {
      const M = V.Scene3D.Mappers;
      const coarse = M.regionFill('stipple', [SQ], { spacing: 8 });
      const fine = M.regionFill('stipple', [SQ], { spacing: 4 });
      expect(coarse.length).toBeGreaterThan(0);
      expect(fine.length).toBeGreaterThan(coarse.length);
      // A dot is a small closed ring well inside the 40×40 region.
      const d = coarse[0];
      expect(d.length).toBeGreaterThanOrEqual(6);
      d.forEach((pt) => { expect(pt.x).toBeGreaterThan(-1); expect(pt.x).toBeLessThan(41); });
    });

    test('stipple is deterministic (same dots across calls)', () => {
      const M = V.Scene3D.Mappers;
      const a = M.regionFill('stipple', [SQ], { spacing: 6 });
      const b = M.regionFill('stipple', [SQ], { spacing: 6 });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    test('stipple fills a TRIANGULAR region (pointInPolygon needs the closed ring)', () => {
      // Regression: a 3-vertex face used to emit zero dots (pip rejects <4 pts).
      const TRI = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 20, y: 40 }];
      expect(V.Scene3D.Mappers.regionFill('stipple', [TRI], { spacing: 6 }).length).toBeGreaterThan(3);
    });

    test('stipple thins UNIFORMLY (no blank band) and stays bounded on a huge dense region', () => {
      const BIG = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 400 }, { x: 0, y: 400 }];
      const dots = V.Scene3D.Mappers.regionFill('stipple', [BIG], { spacing: 1 });
      expect(dots.length).toBeGreaterThan(1000);
      expect(dots.length).toBeLessThan(15000); // bounded, not a bbox/step runaway
      // Dots reach the BOTTOM of the region (not truncated to a top strip).
      const maxY = Math.max(...dots.map((d) => Math.max(...d.map((p) => p.y))));
      expect(maxY).toBeGreaterThan(300);
    });

    test('contour CARVES a hole — rings do not fill an interior hole loop', () => {
      const outer = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }];
      // A hole loop (wound opposite) in the centre.
      const hole = [{ x: 14, y: 26 }, { x: 26, y: 26 }, { x: 26, y: 14 }, { x: 14, y: 14 }];
      const rings = V.Scene3D.Mappers.regionFill('contour', [outer, hole], { spacing: 4 });
      expect(rings.length).toBeGreaterThan(0);
      const pip = V.PathBoolean.pointInPolygon;
      const holeClosed = hole.concat([hole[0]]);
      let inHole = 0; let total = 0;
      rings.forEach((r) => r.forEach((p) => { total += 1; if (pip({ x: p.x, y: p.y }, holeClosed)) inHole += 1; }));
      // Essentially no contour geometry lands inside the empty hole.
      expect(inHole / total).toBeLessThan(0.1);
    });

    // ── W-21 (F-20) — Contour on a SMALL facet (a buckyball pentagon/hexagon
    // is ~12-15mm across) must not collapse to the lone boundary ring at the
    // default ("med", fillDensity 50 ⇒ spacing 7.5mm) density — that is byte-
    // identical in shape to the plain face outline "none" already draws, so
    // Type=Contour read as completely inert on the solid primitive. RED (pre-
    // fix): `regionFill('contour', [SMALL_FACE], { spacing: 7.5 })` returned
    // exactly 1 ring (measured directly against this module before the fix).
    describe('W-21 (F-20) — small facets get a genuine inset, not just the boundary', () => {
      // ~13x15mm — measured off a real default buckyball's face bounding box.
      const SMALL_FACE = [{ x: 0, y: 0 }, { x: 13, y: 0 }, { x: 13, y: 15 }, { x: 0, y: 15 }];
      const MED_DENSITY_SPACING = 7.5; // hatchSpacing(50) — scene3d.js's own formula

      test('a small face gets at least 2 rings (boundary + a real inset) at med density', () => {
        const rings = V.Scene3D.Mappers.regionFill('contour', [SMALL_FACE], { spacing: MED_DENSITY_SPACING });
        expect(rings.length).toBeGreaterThanOrEqual(2);
      });

      test('ring count still grows with density on a small face (Density keeps driving the count)', () => {
        const med = V.Scene3D.Mappers.regionFill('contour', [SMALL_FACE], { spacing: MED_DENSITY_SPACING });
        const max = V.Scene3D.Mappers.regionFill('contour', [SMALL_FACE], { spacing: 0.5 }); // ~fillDensity 220
        expect(max.length).toBeGreaterThan(med.length);
      });

      test('no small-face ring geometry lands outside the face silhouette', () => {
        const rings = V.Scene3D.Mappers.regionFill('contour', [SMALL_FACE], { spacing: MED_DENSITY_SPACING });
        const pip = V.PathBoolean.pointInPolygon;
        const closed = SMALL_FACE.concat([SMALL_FACE[0]]);
        rings.forEach((r) => r.forEach((p) => {
          // Inside, or on the boundary itself (the outer ring re-touches it),
          // with a tiny epsilon for the boundary's own vertices.
          const inside = pip({ x: p.x, y: p.y }, closed);
          const onBoundary = p.x <= 1e-6 || p.x >= 13 - 1e-6 || p.y <= 1e-6 || p.y >= 15 - 1e-6;
          expect(inside || onBoundary).toBe(true);
        }));
      });

      // Regression guard: an already-adequately-sized region (box-scale) must
      // succeed on the FIRST attempt, so the adaptive retry never engages and
      // its output is unchanged from a plain (non-retried) insetPasses call.
      test('a box-scale region is unaffected (first attempt already succeeds, no retry)', () => {
        const BOX_FACE = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }];
        const direct = V.Scene3D.Mappers.insetPasses([BOX_FACE], MED_DENSITY_SPACING).flat();
        const viaRegionFill = V.Scene3D.Mappers.regionFill('contour', [BOX_FACE], { spacing: MED_DENSITY_SPACING });
        expect(viaRegionFill.length).toBe(direct.length);
      });
    });
  });

  // ── Phase 3: true spiral (single clipped Archimedean spiral, not rings) ──────
  describe('Scene3D.Mappers.trueSpiral (Phase 3)', () => {
    const BIG = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }];
    const SQ = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }];
    const CX = 100; const CY = 100;
    const allPts = (runs) => runs.reduce((a, r) => a.concat(r), []);
    const longest = (runs) => runs.slice().sort((a, b) => b.length - a.length)[0] || [];
    // Cumulative signed winding angle about (cx,cy) along a polyline.
    const winding = (run, cx, cy) => {
      let w = 0;
      for (let i = 1; i < run.length; i++) {
        const a0 = Math.atan2(run[i - 1].y - cy, run[i - 1].x - cx);
        const a1 = Math.atan2(run[i].y - cy, run[i].x - cx);
        let d = a1 - a0;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        w += d;
      }
      return w;
    };

    test('trueSpiral is exported', () => {
      expect(typeof V.Scene3D.Mappers.trueSpiral).toBe('function');
    });

    // HEADLINE (Jay's complaint): a spiral on a cube face must be ONE spiral —
    // winding many turns with a radius that grows monotonically from the centre —
    // NOT a set of concentric rings (constant-then-jumping radius). This FAILS on
    // the pre-Phase-3 stitched-ring output.
    test('the central run is one spiral: >3 turns, radius grows monotonically', () => {
      const runs = V.Scene3D.Mappers.regionFill('spiral', [BIG], { spacing: 10 });
      expect(runs.length).toBeGreaterThan(0);
      const main = longest(runs);
      // Radius (near-)monotonic increasing — a spiral, not stacked rings.
      let prev = -Infinity; let drops = 0;
      main.forEach((p) => {
        const r = Math.hypot(p.x - CX, p.y - CY);
        if (r < prev - 0.5) drops += 1;
        prev = r;
      });
      expect(drops).toBeLessThanOrEqual(1);
      // Many turns (a spiral winds continuously; concentric rings would be split).
      expect(Math.abs(winding(main, CX, CY))).toBeGreaterThan(3 * 2 * Math.PI);
    });

    test('every emitted vertex lies within (or on) the region', () => {
      const runs = V.Scene3D.Mappers.regionFill('spiral', [SQ], { spacing: 4 });
      const pip = V.PathBoolean.pointInPolygon;
      const closed = SQ.concat([SQ[0]]);
      const pts = allPts(runs);
      expect(pts.length).toBeGreaterThan(0);
      const EPS = 1e-3;
      pts.forEach((p) => {
        expect(p.x).toBeGreaterThanOrEqual(-EPS);
        expect(p.x).toBeLessThanOrEqual(40 + EPS);
        expect(p.y).toBeGreaterThanOrEqual(-EPS);
        expect(p.y).toBeLessThanOrEqual(40 + EPS);
      });
      // Most interior vertices are strictly inside (endpoints sit on the edge).
      const inside = pts.filter((p) => pip(p, closed)).length;
      expect(inside / pts.length).toBeGreaterThan(0.8);
    });

    test('smaller pitch ⇒ more turns / more geometry', () => {
      const fine = V.Scene3D.Mappers.regionFill('spiral', [BIG], { pitch: 3 });
      const coarse = V.Scene3D.Mappers.regionFill('spiral', [BIG], { pitch: 12 });
      expect(allPts(fine).length).toBeGreaterThan(allPts(coarse).length);
    });

    test('axisSnap produces axis-aligned (horizontal/vertical) segments', () => {
      const snapped = longest(V.Scene3D.Mappers.regionFill('spiral', [BIG], { pitch: 10, axisSnap: true }));
      let aligned = 0; let total = 0;
      for (let i = 1; i < snapped.length; i++) {
        const dx = Math.abs(snapped[i].x - snapped[i - 1].x);
        const dy = Math.abs(snapped[i].y - snapped[i - 1].y);
        const mn = Math.min(dx, dy); const mx = Math.max(dx, dy);
        if (mx > 1e-6 && mn / mx < 0.15) aligned += 1;
        total += 1;
      }
      expect(total).toBeGreaterThan(4);
      expect(aligned / total).toBeGreaterThan(0.6);
    });

    test('eccentricity stretches the spiral to fill a non-square region', () => {
      const WIDE = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 60 }, { x: 0, y: 60 }];
      // The central spiral's bounding-box aspect reflects the stretch: auto-fit
      // widens it to span the region; a forced-circular spiral (ecc 1) only
      // reaches the inscribed radius (≈square footprint).
      const runAspect = (runs) => {
        const run = longest(runs);
        const xs = run.map((p) => p.x); const ys = run.map((p) => p.y);
        return (Math.max(...xs) - Math.min(...xs)) / Math.max(1e-6, Math.max(...ys) - Math.min(...ys));
      };
      const auto = V.Scene3D.Mappers.regionFill('spiral', [WIDE], { pitch: 4 }); // auto-fit ⇒ wide
      const circ = V.Scene3D.Mappers.regionFill('spiral', [WIDE], { pitch: 4, eccentricity: 1 });
      expect(runAspect(auto)).toBeGreaterThan(runAspect(circ) * 1.5);
    });

    // ── W-25 (fill-audit-d) ───────────────────────────────────────────────
    // On a THIN SLIVER region far smaller than the density-derived pitch —
    // the shape of a low-poly imported mesh's cusp faces (measured bw≈1.8mm,
    // bh≈10mm on the Unit F torus fixture's cusp faces, 24x12 tessellation,
    // tests/unit/scene3d-mesh-self-occlusion.test.js) — the raw parametric
    // radius blows past rMax within well under one revolution, so pre-fix
    // trueSpiral clipped its output down to a single near-straight radial
    // stub instead of a genuine curl. Several adjacent cusp faces each
    // drawing one such stub, all similarly oriented, is what reads on screen
    // as a wedge of straight parallel lines cutting across the surrounding
    // curved "comma" marks (docs/3d-audit/fill-audit/after/W-25/ before/
    // after crops — the wedge is visibly gone after this fix). RED before
    // the SPIRAL_MIN_TURNS floor: `npx vitest run tests/unit/scene3d-
    // mappers.test.js -t "thin sliver"` on the pre-fix source measured
    // winding ≈ 0.9 rad (well under a full curl) and arcLen/straightDist ≈
    // 1.39 (nearly straight); this test pins both above a genuine-curl floor.
    test('a thin sliver (bw/bh well outside the eccentricity clamp) still gets a genuine curl, not a near-straight stub (W-25)', () => {
      const SLIVER = [{ x: 0, y: 0 }, { x: 1.8, y: 0 }, { x: 1.8, y: 10 }, { x: 0, y: 10 }];
      const runs = V.Scene3D.Mappers.regionFill('spiral', [SLIVER], { pitch: 5.84 });
      expect(runs.length).toBeGreaterThan(0);
      const main = longest(runs);
      expect(main.length).toBeGreaterThan(2);
      const cx = 0.9; const cy = 5; // region centroid
      // A near-straight radial stub winds under ~90° (Math.PI/2) about the
      // centre; a genuine curl sweeps well past that.
      expect(Math.abs(winding(main, cx, cy))).toBeGreaterThan(Math.PI);
      const arcLen = main.reduce(
        (d, p, i) => (i === 0 ? 0 : d + Math.hypot(p.x - main[i - 1].x, p.y - main[i - 1].y)), 0,
      );
      const straightDist = Math.hypot(main[main.length - 1].x - main[0].x, main[main.length - 1].y - main[0].y);
      expect(arcLen / Math.max(1e-6, straightDist)).toBeGreaterThan(2);
    });

    test('a region at or above the normal working size is unaffected by the W-25 min-turns floor (no-op guard)', () => {
      // BIG (200x200, rMax ≈141mm) sits far above any density-derived pitch
      // (0.2–40mm), so `Math.min(pitch, rMax / SPIRAL_MIN_TURNS)` must select
      // the UNMODIFIED pitch — pinning that the W-25 fix is a true no-op for
      // ordinary primitive-sized regions (byte-identical to before the fix).
      const runs = V.Scene3D.Mappers.regionFill('spiral', [BIG], { pitch: 10 });
      const main = longest(runs);
      expect(Math.abs(winding(main, CX, CY))).toBeGreaterThan(3 * 2 * Math.PI);
    });

    // ── W-25b (fill-audit-d) ─────────────────────────────────────────────
    // W-25's original gate was SIZE-only (`rMax < pitch * SPIRAL_MIN_TURNS`)
    // and never checked SHAPE — so it also fires on a small-but-REGULAR
    // (near-square) face, not just a thin sliver. A reviewer measured this
    // directly on the shipped default: at density 50 (pitch 7.2mm, so the
    // W-25 size threshold is 14.4mm) every face of the default buckyball has
    // rMax 7.0-8.4mm — under the threshold — even though its faces are
    // near-regular pentagons/hexagons (aspect 0.87-1.15), nothing like Unit
    // F's torus cusp faces (aspect ~0.18). FACE below reproduces those exact
    // proportions (bw=16mm, bh=15mm, aspect 1.067 — well inside the
    // eccentricity clamp's [0.3, 3] range, i.e. NOT a thin cusp) at the real
    // pitch (7.2mm = density 50's derived pitch, measured via the fingerprint
    // test below). RED at 44797f53 (W-25, unconditional floor): winding ≈
    // 9.192 rad (1.463 turns), mainLen 95 — the floor fires anyway. GREEN
    // after W-25b's aspect-ratio gate: winding ≈ 7.404 rad (1.178 turns),
    // mainLen 77 — exactly the UNMODIFIED-pitch output (byte-identical to
    // 55ddb720, pre-W-25 entirely), because a near-square face is never a
    // thin cusp regardless of size.
    test('a small NEAR-SQUARE region (not a thin cusp) is unaffected by the W-25 min-turns floor even though it sits below the size threshold (W-25b)', () => {
      const FACE = [{ x: 0, y: 0 }, { x: 16, y: 0 }, { x: 16, y: 15 }, { x: 0, y: 15 }]; // aspect 16/15 = 1.0667
      const runs = V.Scene3D.Mappers.regionFill('spiral', [FACE], { pitch: 7.2 });
      const main = longest(runs);
      const cx = 8; const cy = 7.5; // region centroid
      expect(main.length).toBe(77);
      expect(winding(main, cx, cy)).toBeCloseTo(7.403973145757696, 9);
      // Explicitly rule out the OLD (size-only) behavior's signature: that
      // gate would have shortened the effective pitch, pushing well past 2
      // full turns' worth of winding (measured 9.192 rad at 44797f53).
      expect(Math.abs(winding(main, cx, cy))).toBeLessThan(2 * Math.PI * 1.3);
    });

    // A genuinely thin AND small region must still hit the floor (the W-25b
    // gate is AND, not a replacement) — sanity-check with the eccentricity
    // clamp's own boundary value (aspect exactly 0.3, the edge of "thin").
    test('a region right at the eccentricity clamp boundary (aspect 0.3) still counts as thin-cusp (W-25b boundary)', () => {
      // bw/bh = 3/10 = 0.3 exactly — AT the clamp boundary, which the
      // `rawAspect < ECC_MIN || rawAspect > ECC_MAX` gate (strict inequality)
      // treats as NOT thin (matches the clamp's own inclusive range), so this
      // pins the boundary is INSIDE (unfloored) rather than silently flipping
      // sign on a `<=`/`<` typo in a future edit.
      const AT_BOUNDARY = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 10 }, { x: 0, y: 10 }];
      const JUST_THIN = [{ x: 0, y: 0 }, { x: 2.9, y: 0 }, { x: 2.9, y: 10 }, { x: 0, y: 10 }];
      const boundaryRuns = V.Scene3D.Mappers.regionFill('spiral', [AT_BOUNDARY], { pitch: 5 });
      const thinRuns = V.Scene3D.Mappers.regionFill('spiral', [JUST_THIN], { pitch: 5 });
      const boundaryMain = longest(boundaryRuns);
      const thinMain = longest(thinRuns);
      // Same pitch, same rMax to a hair — a floored run must have MORE
      // points than an unfloored one (smaller effPitch ⇒ smaller dr ⇒ more
      // steps to reach the same rEnd).
      expect(thinMain.length).toBeGreaterThan(boundaryMain.length);
    });

    test('deterministic — identical output for identical params', () => {
      const a = V.Scene3D.Mappers.regionFill('spiral', [BIG], { spacing: 7, axisSnap: false });
      const b = V.Scene3D.Mappers.regionFill('spiral', [BIG], { spacing: 7, axisSnap: false });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  });

  // ── Algorithm dispatch (stubbed cascade) ────────────────────────────────────
  describe('algorithm dispatch', () => {
    ['crosshatch', 'contour', 'spiral', 'stipple'].forEach((mapper) => {
      test(`${mapper} emits sceneFill and suppresses the face outline + creases`, () => {
        installStub();
        const paths = algo.generate(sceneParams(mapper, [box('obj-1')]), null, null, BOUNDS) || [];
        expect(fills(paths).length).toBeGreaterThan(0);
        // Surface fills replace the per-face outline (no sceneFace) and interior
        // creases (a box has 0 crease edges left under the fill; only silhouette/
        // boundary sceneEdges remain).
        expect(kind(paths, 'sceneFace').length).toBe(0);
        const creases = kind(paths, 'sceneEdge').filter((p) => p.meta.sceneTarget && p.meta.sceneTarget.faceId == null);
        expect(creases.length).toBe(0);
      });
    });

    test('crosshatch draws MORE fill lines than hatch (the perpendicular pass)', () => {
      installStub();
      const hatch = fills(algo.generate(sceneParams('hatch', [box('obj-1')]), null, null, BOUNDS) || []).length;
      const cross = fills(algo.generate(sceneParams('crosshatch', [box('obj-1')]), null, null, BOUNDS) || []).length;
      expect(cross).toBeGreaterThan(hatch);
    });

    test('a draft (fastPreview) frame still emits fills for every mapper without hanging', () => {
      installStub();
      ['crosshatch', 'contour', 'spiral', 'stipple'].forEach((mapper) => {
        const paths = algo.generate(sceneParams(mapper, [box('obj-1')]), null, null, { ...BOUNDS, fastPreview: true }) || [];
        expect(fills(paths).length).toBeGreaterThan(0);
      });
    });

    test('a curved primitive (sphere) fills as one region for every mapper', () => {
      installStub();
      const sphere = { id: 'obj-1', name: 's', primitive: 'sphere', params: { radius: 22, detail: 18 }, transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
      ['crosshatch', 'contour', 'spiral', 'stipple'].forEach((mapper) => {
        const paths = algo.generate(sceneParams(mapper, [sphere]), null, null, BOUNDS) || [];
        expect(fills(paths).length).toBeGreaterThan(0);
      });
    });
  });

  // ── W-25b (fill-audit-d) — full-pipeline fingerprint ────────────────────────
  // The pure-module tests above pin the SHAPE of the fix; this pins the actual
  // shipped default end to end (real StyleCascade, real algorithm dispatch,
  // real solid/buckyball geometry — no stub). RED at 44797f53 (W-25's
  // unconditional size-only floor): fillCount 31, totalPoints 1826, inkMm
  // 486.527 — every one of the buckyball's 16 visible faces (measured rMax
  // 7.0-8.4mm at density 50's pitch 7.2mm) got floored despite being
  // near-regular, not thin. GREEN after W-25b (this fix): byte-identical to
  // 55ddb720 (the commit immediately BEFORE W-25 existed at all) — the
  // buckyball's spiral fill is untouched by either W-25 or W-25b, exactly as
  // W-25's own commit message claimed but did not verify.
  test('the default buckyball is byte-identical to the pre-W-25 fingerprint at density 50 (W-25b)', () => {
    const params = sceneParams('spiral', [solidBuckyball('obj-1')]);
    const paths = algo.generate(params, null, null, BOUNDS) || [];
    const fillPaths = fills(paths);
    let totalPoints = 0;
    let inkMm = 0;
    fillPaths.forEach((p) => {
      totalPoints += p.length;
      for (let i = 1; i < p.length; i += 1) inkMm += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    });
    expect(fillPaths.length).toBe(21);
    expect(totalPoints).toBe(1006);
    expect(Math.round(inkMm * 1000) / 1000).toBeCloseTo(284.148, 2);
  });

  // ── Params whitelist (real path, no stub) ───────────────────────────────────
  test('normalizeParams keeps the new mapper names (real StyleCascade path emits fills)', () => {
    // No stub: the real StyleCascade + params.normalizeParams run. If the mapper
    // were not whitelisted it would reset to 'none' and emit 0 fills.
    ['crosshatch', 'contour', 'spiral', 'stipple'].forEach((mapper) => {
      const paths = algo.generate(sceneParams(mapper, [box('obj-1')]), null, null, BOUNDS) || [];
      expect(fills(paths).length).toBeGreaterThan(0);
    });
  });
});
