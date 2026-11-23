/*
 * RGR — THE A3 ORACLE SPLIT IS A DERIVATION, NOT A FUDGE.
 *
 * STATUS: DONE. `docs/3d-audit/lane-reports/A3-plan.md` measured that 89-98%
 * of `ringNotInkMm2` on the five F1 self-crossing laws is area no 0.3 mm pen
 * can ink while its centre stays inside the *clipped* ribbon polygon — a
 * geometric consequence of eroding convex corners, not dropped fill. The
 * binding amended brief, `docs/3d-audit/lane-reports/A3-judge.md` §5 items
 * A1/A2, requires that this split be provably HONEST before it is allowed to
 * change any assertion: it must not be able to hide a genuinely dropped
 * ruling behind "pen-unreachable", and its predicate must be a derivation
 * (matching a closed-form corner-wedge formula) rather than a number sized
 * to make five values pass. This file is that proof. It makes NO `src/`
 * change and adds NO new production code — every assertion below exercises
 * `tests/helpers/scene3d-ring-coverage.js`'s `classifyReachabilityAtDivisor`
 * / `buildCoverageGrid` / `findUncoveredClusters`.
 *
 * PART 1 — SYNTHETIC-VOID HONESTY CHECK (A3-judge.md §4 / A3-plan.md §6.3.1).
 * `PenFill.fillRegion` is wrapped to drop every second path it returns
 * across the WHOLE torus build (an unmistakable, deliberate hole — nothing
 * subtle). If the reachability split could be satisfied by simply calling
 * "narrow-looking" voids unreachable, this dropped ruling — which sits in
 * the middle of an otherwise-wide, otherwise-fully-inked band, with plenty
 * of room for an admissible pen centre on either side — would score as
 * "unreachable" too, and the metric would be worthless. `ringNotInkReachableMm2`
 * must instead EXPLODE (baseline on this exact law/fixture, undropped, is
 * 0.15 mm² — see `scene3d-ribbon-f1b-streaks.test.js`). The judge's own
 * reproduction (`judge4.js`, a 1-in-6-sampled variant of this exact idea)
 * measured `ringNotInkReachableMm2` rising from 0.152 to ~52 (extrapolated
 * ~315 at full sampling) under an every-2nd-path drop — a ~2000x rise. This
 * test pins a much smaller but still unambiguous bar (`> 1.0`, i.e. > 5x the
 * dirty-baseline diagnostic ceiling used elsewhere in this suite).
 *
 * PART 2 — DERIVED-NOT-TUNED PROOF (A3-plan.md §6.3.2). Pure geometry, no
 * scene, no ink: a 3 mm square (four 90 deg corners) and a 3 mm equilateral
 * triangle (three 60 deg corners), penWidth 0.3 (r = 0.15). For a convex
 * corner of interior angle theta, the deepest point of the polygon NO pen
 * centre kept >= r inside the polygon can reach is exactly
 * `r * (csc(theta/2) - 1)` from the vertex, along the angle bisector:
 * 90 deg -> 0.0621 mm, 60 deg -> 0.1500 mm. The classifier's own
 * reachable/unreachable boundary, measured empirically along each bisector,
 * must land on that closed form within about one coverage cell
 * (`penWidth/4` = 0.075 mm) — proof the predicate is a derivation, not a
 * number picked to make five laws pass.
 *
 * PART 2b — KNOWN BLIND SPOT, ON THE RECORD (A3-judge.md §1, case D3). Any
 * region narrower than one pen width is excused UNCONDITIONALLY, however
 * long: a 20 x 0.28 mm blank sliver (< 1 pen wide) scores essentially ZERO
 * reachable defect, even though it is entirely un-inked. This is not a bug
 * in THIS predicate (a real pen genuinely cannot centre itself >= r inside a
 * region narrower than 2r without leaving the region) — but the judge is
 * explicit that a future change producing blank slivers must not be able to
 * hide behind this fact silently. Documented here as a known-blind case, not
 * asserted as "correct" beyond "this is today's measured behaviour".
 *
 * PART 3 — CONTROL INVARIANCE (A3-plan.md §6.3.3). `taperedEnds` (the F1B
 * suite's clean control) and two clean laws from
 * `scene3d-ribbon-wall-coverage.test.js`'s fixture keep `ringFillRate`
 * unchanged and `ringNotInkReachableMm2 <= 0.18` — the split does not
 * disturb a law that was already clean.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const {
  captureClipGroups, captureSelfOcclusionFootprint, measureRingFillRate,
  buildCoverageGrid, classifyReachabilityAtDivisor, DEFAULT_REACHABILITY_LATTICE_DIVISOR,
} = require('../helpers/scene3d-ring-coverage');

const PEN_WIDTH = 0.3; // BOUNDS default (tests/fixtures/scene3d-shadow-anatomy.js)
const HONEST_STREAK_LAW = 'interlockWeave';
const SYNTHETIC_VOID_MIN_MM2 = 1.0; // >5x the diagnostic ceiling used in scene3d-ribbon-f1b-streaks.test.js
const CONTROL_LAWS = ['taperedEnds', 'nibAngle', 'weightModulated']; // taperedEnds (F1B) + two clean CLS_WALLS-fixture laws
const STREAK_BAND_MM2 = 0.18;

/**
 * Wrap `PenFill.fillRegion` so every SECOND path it returns, counted across
 * the WHOLE build (not per-call), is dropped. A deliberate, unmistakable
 * dropped-ruling simulation — see this file's header, Part 1.
 */
const wrapPenFillDropEveryOtherPath = (V) => {
  const orig = V.PenFill && V.PenFill.fillRegion;
  let counter = 0;
  let dropped = 0;
  if (typeof orig !== 'function') return { dropped: 0, restore: () => {} };
  V.PenFill.fillRegion = function patchedFillRegion(...args) {
    const res = orig.apply(this, args);
    if (res && Array.isArray(res.paths) && res.paths.length) {
      const kept = res.paths.filter(() => {
        const keep = (counter % 2) === 0;
        counter += 1;
        if (!keep) dropped += 1;
        return keep;
      });
      return { ...res, paths: kept };
    }
    return res;
  };
  return {
    get dropped() { return dropped; },
    restore: () => { V.PenFill.fillRegion = orig; },
  };
};

const buildTorusLaw = (V, toneLaw) => {
  const engine = new V.VectorEngine();
  const groupId = engine.addLayer('scene3d');
  const group = engine.layers.find((l) => l && l.id === groupId);
  const obj = engine.getLayerDescendants(groupId).filter((l) => l && l.type === 'object3d')[0];
  obj.params.primitive = 'torus';
  obj.params.style = obj.params.style || { penId: null, mapper: 'hatch', params: {} };
  obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw };
  return { engine, group };
};

// ── PART 2 helpers: pure-geometry corner-wedge derivation ──────────────────

/** Unit vector bisecting the interior angle at vertex `v`, given its two ring-neighbours `a`, `b`. */
const bisectorAt = (v, a, b) => {
  const d1x = a.x - v.x; const d1y = a.y - v.y;
  const d2x = b.x - v.x; const d2y = b.y - v.y;
  const l1 = Math.hypot(d1x, d1y); const l2 = Math.hypot(d2x, d2y);
  const ux = d1x / l1 + d2x / l2;
  const uy = d1y / l1 + d2y / l2;
  const ul = Math.hypot(ux, uy) || 1;
  return { x: ux / ul, y: uy / ul };
};

/** Interior angle (radians) at vertex `v` given its two ring-neighbours. */
const interiorAngleAt = (v, a, b) => {
  const d1x = a.x - v.x; const d1y = a.y - v.y;
  const d2x = b.x - v.x; const d2y = b.y - v.y;
  const l1 = Math.hypot(d1x, d1y); const l2 = Math.hypot(d2x, d2y);
  const dot = Math.max(-1, Math.min(1, (d1x * d2x + d1y * d2y) / (l1 * l2)));
  return Math.acos(dot);
};

/**
 * Empirically measure how far the UNREACHABLE classification extends from
 * `vertex` along unit direction `dir`, restricted to cells within `perpTol`
 * of the bisector line — this is the measured wedge depth to compare against
 * the closed form `r * (csc(theta/2) - 1)`.
 */
const measureUnreachableDepthAlongRay = (grid, reachableFlags, vertex, dir, maxT, perpTol) => {
  const { ox, oy, cs, uncovered } = grid;
  let maxUnreachableT = 0;
  uncovered.forEach((cell, idx) => {
    const x = ox + (cell.i + 0.5) * cs;
    const y = oy + (cell.j + 0.5) * cs;
    const vx = x - vertex.x; const vy = y - vertex.y;
    const t = vx * dir.x + vy * dir.y;
    if (t < 0 || t > maxT) return;
    const perp = Math.abs(vx * dir.y - vy * dir.x);
    if (perp > perpTol) return;
    if (!reachableFlags[idx] && t > maxUnreachableT) maxUnreachableT = t;
  });
  return maxUnreachableT;
};

describe('scene3d-ring-coverage — A3 oracle-split honesty proofs', () => {
  describe('Part 1 — synthetic-void: a genuinely dropped ruling is NOT excused as unreachable', () => {
    let runtime; let V;
    beforeAll(async () => {
      runtime = await loadVecturaRuntime({ includeUi: true });
      V = runtime.window.Vectura;
    }, 300000);
    afterAll(() => runtime && runtime.cleanup());

    test(`${HONEST_STREAK_LAW} — dropping every second emitted ruling explodes ringNotInkReachableMm2`, () => {
      const { engine, group } = buildTorusLaw(V, HONEST_STREAK_LAW);

      const cap = captureClipGroups(V);
      const occ = captureSelfOcclusionFootprint(V);
      const drop = wrapPenFillDropEveryOtherPath(V);
      engine.computeAllDisplayGeometry();
      cap.restore(); occ.restore(); drop.restore();

      expect(drop.dropped).toBeGreaterThan(0); // the drop actually fired

      const ink = (group.scenePaths || []).filter((p) => p && p.meta && p.meta.kind === 'sceneFill');
      const coverage = measureRingFillRate(cap.groups, ink, PEN_WIDTH, { selfOccludedSegments: occ.segments });

      // Baseline on this exact law/fixture (undropped) is ~0.15 mm² — see
      // scene3d-ribbon-f1b-streaks.test.js. A classifier that could hide a
      // dropped ruling behind "unreachable" would leave this number near
      // baseline; the honest predicate must show it exploding instead.
      expect(coverage.ringNotInkReachableMm2,
        `dropped=${drop.dropped} paths, ringNotInkReachableMm2=${coverage.ringNotInkReachableMm2.toFixed(4)} `
        + `(undropped baseline ~0.15 mm²)`).toBeGreaterThan(SYNTHETIC_VOID_MIN_MM2);
    }, 300000);
  });

  describe('Part 2 — derived, not tuned: corner-wedge depth matches r(csc(theta/2)-1)', () => {
    const PEN = 0.3;
    const R = PEN / 2;
    const CS_TOL = 1.5 * Math.max(PEN / 4, 0.01); // ~one coverage cell of slack

    test('90 deg square corner: measured wedge depth ~= 0.0621 mm', () => {
      const square = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 3 }];
      const ringGroups = [[square]];
      const grid = buildCoverageGrid(ringGroups, [], PEN); // no ink -> the whole square is "uncovered"
      const { reachableFlags } = classifyReachabilityAtDivisor(grid, PEN, DEFAULT_REACHABILITY_LATTICE_DIVISOR);

      const v = square[0]; const a = square[3]; const b = square[1]; // neighbours of (0,0)
      const theta = interiorAngleAt(v, a, b);
      expect(theta).toBeCloseTo(Math.PI / 2, 3);
      const dir = bisectorAt(v, a, b);
      const expectedDepth = R * (1 / Math.sin(theta / 2) - 1);
      expect(expectedDepth).toBeCloseTo(0.0621, 3);

      const measuredDepth = measureUnreachableDepthAlongRay(grid, reachableFlags, v, dir, 0.5, grid.cs * 0.75);
      expect(Math.abs(measuredDepth - expectedDepth),
        `measured=${measuredDepth.toFixed(4)} expected=${expectedDepth.toFixed(4)}`).toBeLessThanOrEqual(CS_TOL);
    });

    test('60 deg equilateral-triangle corner: measured wedge depth ~= 0.1500 mm', () => {
      const side = 3;
      const A = { x: 0, y: 0 };
      const B = { x: side, y: 0 };
      const C = { x: side / 2, y: (side * Math.sqrt(3)) / 2 };
      const ringGroups = [[[A, B, C]]];
      const grid = buildCoverageGrid(ringGroups, [], PEN);
      const { reachableFlags } = classifyReachabilityAtDivisor(grid, PEN, DEFAULT_REACHABILITY_LATTICE_DIVISOR);

      const theta = interiorAngleAt(A, C, B); // neighbours of A are C and B, order irrelevant to the bisector
      expect(theta).toBeCloseTo(Math.PI / 3, 3);
      const dir = bisectorAt(A, C, B);
      const expectedDepth = R * (1 / Math.sin(theta / 2) - 1);
      expect(expectedDepth).toBeCloseTo(0.15, 3);

      const measuredDepth = measureUnreachableDepthAlongRay(grid, reachableFlags, A, dir, 0.5, grid.cs * 0.75);
      expect(Math.abs(measuredDepth - expectedDepth),
        `measured=${measuredDepth.toFixed(4)} expected=${expectedDepth.toFixed(4)}`).toBeLessThanOrEqual(CS_TOL);
    });

    // Part 2b — known blind spot, on the record (A3-judge.md §1, case D3).
    test('D3 (documented known blind spot) — a 20 x 0.28 mm blank sliver (< 1 pen wide) scores ~0 reachable defect', () => {
      const sliver = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 0.28 }, { x: 0, y: 0.28 }];
      const ringGroups = [[sliver]];
      const grid = buildCoverageGrid(ringGroups, [], PEN); // no ink -> entire sliver is "uncovered"
      const { reachableCount, unreachableCount } = classifyReachabilityAtDivisor(
        grid, PEN, DEFAULT_REACHABILITY_LATTICE_DIVISOR,
      );
      // A region narrower than 2r = 0.3 mm cannot contain ANY point >= r from
      // both long edges — this is a real geometric fact, not a defect in the
      // predicate. Documented so a future regression that starts leaving
      // blank sub-pen slivers cannot silently point at "it's unreachable" as
      // if that excused it from a placement/coverage review.
      expect(reachableCount, `reachable=${reachableCount} unreachable=${unreachableCount}`).toBe(0);
      expect(unreachableCount).toBeGreaterThan(0);
    });
  });

  describe('Part 3 — control invariance: clean laws are unaffected by the split', () => {
    let runtime; let V;
    beforeAll(async () => {
      runtime = await loadVecturaRuntime({ includeUi: true });
      V = runtime.window.Vectura;
    }, 300000);
    afterAll(() => runtime && runtime.cleanup());

    test.each(CONTROL_LAWS)('%s — ringFillRate unchanged (>= 0.995) and ringNotInkReachableMm2 <= 0.18', (law) => {
      const { engine, group } = buildTorusLaw(V, law);
      const cap = captureClipGroups(V);
      const occ = captureSelfOcclusionFootprint(V);
      engine.computeAllDisplayGeometry();
      cap.restore(); occ.restore();
      const ink = (group.scenePaths || []).filter((p) => p && p.meta && p.meta.kind === 'sceneFill');
      const coverage = measureRingFillRate(cap.groups, ink, PEN_WIDTH, { selfOccludedSegments: occ.segments });
      expect(coverage.ringFillRate).not.toBeNull();
      expect(coverage.ringFillRate).toBeGreaterThanOrEqual(0.995);
      expect(coverage.ringNotInkReachableMm2,
        `${law}: ringNotInkReachableMm2=${coverage.ringNotInkReachableMm2.toFixed(4)}`)
        .toBeLessThanOrEqual(STREAK_BAND_MM2);
    }, 300000);
  });
});
