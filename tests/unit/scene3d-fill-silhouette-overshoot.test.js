const crypto = require('crypto');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * W-32 RANK 4 — THE DRAWN BORDER FALLS SHORT OF THE TRUE SILHOUETTE.
 *
 * Jay's complaint ("lines breaking out beyond the border") has two readings,
 * both real:
 *   1. a ruling end sticks out PAST the grey outline drawn on the paper — THIS
 *      FILE gates that half.
 *   2. a ruling ends short, INSIDE open front-facing surface — that is
 *      `scene3d-fill-boundary-ends.test.js`'s half. Read it, never edit it
 *      (W-32r4-plan.md §1.6): its reference is the CHART, not the drawn ink,
 *      it scores any off-mask point 0.00 mm (`:205-210`), its tolerance is
 *      TOL_MM = 1.0 (3.3 pen) and its raster is CELL = 0.35 mm — none of
 *      which can see this file's 0.15 mm (0.5 pen) defect. It passes 41/41
 *      before AND after this fix; that is not a contradiction, it is two
 *      instruments measuring two different quantities.
 *
 * ROOT CAUSE (W-32r4-plan.md §2). The fill walks the analytic chart and
 * already reaches the TRUE silhouette (osTrue <= 0.01 pen on 132/132 cells
 * measured pre-fix). The DRAWN outline is the projected MESH silhouette — a
 * chord polygon INSCRIBED in the true one, short by the tessellation sagitta.
 * Every ruling end that correctly reaches the true silhouette therefore reads
 * as a barb past the drawn border. Worst measured: ellipsoid 0.72 pen, sphere
 * 0.52 pen, cone 0.52 pen (create rig, d220).
 *
 * THE FIX gated by this file (scene3d.js, 4 sites — see rank1-prototype.diff
 * and W-32r4-plan.md §3.2/§5.4): refine the silhouette/boundary edge chain
 * onto the ANALYTIC silhouette curve (F=0 on the chart, G = grad F . v = 0 on
 * the silhouette, Newton with a numerical grad G), gated to CONVEX charted
 * primitives. The torus is excluded (non-convex — see O5).
 *
 * TWO QUANTITIES, BOTH NEEDED (W-32r4-plan.md §1.1):
 *   osDrawn — distance outside the DRAWN outline (O1/O2's bar).
 *   osTrue  — distance outside the TRUE silhouette (O3's anti-cheat: this
 *             fix must not pass O1 by pulling ink OFF the true surface, the
 *             family Rank 3 — "just clip the ends inward" — was rejected
 *             for).
 *
 * Instrument: for a CONVEX primitive the DRAWN outline is the convex hull of
 * its sceneEdge silhouette+boundary ink (exact — no raster, no cell size).
 * The TRUE silhouette is the convex hull of the SAME chart re-tessellated at
 * detail 200 (residual sagitta 0.0037 mm = 0.012 pen, an order below every
 * bar it judges, and built OUTSIDE the algorithm under test so the fix
 * cannot move its own reference). This reproduces the planner's calibration
 * numbers exactly where they overlap with W-35b's own table (capsule.hatch.a
 * 0.0549 mm, sphere.contour.a 0.1494 mm, ellipsoid.contour.a 0.2005 mm,
 * ellipsoid.hatch.a.d220 0.2172 mm).
 */

const PEN = 0.3; // mm, document default pen — every "pen" figure is mm / 0.3
const W = 320; const H = 220; // doc bounds
const DENSITY = { med: 50, max: 220 };
const SECOND_ANGLE = { yaw: 40, pitch: -15 };
const REF_DETAIL = 200;
const OVERSHOOT_BAR_MM = 0.15;   // W-32's own 0.5-pen bar, restated at its source
const TRUE_ANTI_CHEAT_MM = 0.05; // W-32 §A5's O3, carried forward verbatim

// ── geometry helpers (verbatim from the planner's measure.js, proven against
// W-35b's own table — see the doc comment above) ──────────────────────────
function hull(pts) {
  const p = pts.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = []; for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up = []; for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
}
function sdHull(Hu, x, y) {
  let inside = true; let best = Infinity;
  const n = Hu.length;
  for (let i = 0; i < n; i++) {
    const a = Hu[i]; const b = Hu[(i + 1) % n];
    const ex = b.x - a.x; const ey = b.y - a.y;
    const L = Math.hypot(ex, ey) || 1e-12;
    if (ex * (y - a.y) - ey * (x - a.x) < 0) inside = false;
    let t = ((x - a.x) * ex + (y - a.y) * ey) / (L * L);
    t = Math.max(0, Math.min(1, t));
    const px = a.x + ex * t; const py = a.y + ey * t;
    const d = Math.hypot(x - px, y - py);
    if (d < best) best = d;
  }
  return inside ? -best : best;
}

describe('Scene3D — the fill BORDER refined to the TRUE silhouette (W-32 Rank 4)', () => {
  let runtime; let V; let P; let Scene; let DEFAULT_CAMERA; let DEFAULT_STYLE;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    P = V.Scene3D.Params;
    Scene = V.Scene3D.Scene;
    DEFAULT_CAMERA = P.DEFAULT_CAMERA;
    DEFAULT_STYLE = (V.SCENE_FILL_STYLES && V.SCENE_FILL_STYLES.DEFAULT) || 'ladder';
  });
  afterAll(() => runtime.cleanup());

  const CAM = (angle) => (angle === 'a' ? { ...DEFAULT_CAMERA } : { ...DEFAULT_CAMERA, ...SECOND_ANGLE });
  const bagFor = (primitive, rig) => (rig === 'addLayer'
    ? { ...(P.PRIMITIVE_PARAM_DEFAULTS[primitive] || {}) }
    : { ...(P.PRIMITIVE_PARAM_DEFAULTS[primitive] || {}), ...(P.PRIMITIVE_CREATE_DEFAULTS[primitive] || {}) });

  const trueHullFor = (primitive, angle, bagActual, transform) => {
    const camera = CAM(angle);
    const bag = { ...(bagActual || {}), detail: REF_DETAIL };
    const obj = { id: 'ref', primitive, params: bag, transform: transform || { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 } };
    const mesh = Scene.buildPrimitiveMesh(obj, 1);
    const out = [];
    (mesh.vertices || mesh.verts || []).forEach((v) => {
      const w = Scene.applyObjectTransform(v, obj.transform);
      const s = Scene.projectWorldPoint(w, camera, { width: W, height: H });
      if (s && Number.isFinite(s.x) && Number.isFinite(s.y)) out.push({ x: s.x, y: s.y });
    });
    return hull(out);
  };

  const build = (primitive, mapper, rig, angle, density, detailOverride) => {
    const eng = new V.VectorEngine();
    eng.currentProfile = { width: W, height: H, name: 'w32r4-overshoot' };
    const camera = CAM(angle);
    const gid = eng.addLayer('scene3d');
    let g; let objId; let actualBag; let actualTransform;
    if (rig === 'addLayer') {
      g = eng.layers.find((l) => l.id === gid);
      g.params.camera = camera; g.params.backdrop = { enabled: false };
      const gc = eng.getLayerDescendants(gid).find((l) => l && l.type === 'sceneGround3d');
      if (gc) gc.visible = false;
      const obj = eng.getLayerDescendants(gid).filter((l) => l && l.type === 'object3d')[0];
      obj.params.primitive = primitive;
      if (detailOverride) obj.params.detail = detailOverride;
      obj.params.style = obj.params.style || { penId: null, mapper, params: {} };
      obj.params.style.mapper = mapper;
      obj.params.style.params = { ...(obj.params.style.params || {}), fillAngle: 45, fillDensity: DENSITY[density], toneLaw: DEFAULT_STYLE };
      objId = obj.id;
      actualBag = { ...(P.PRIMITIVE_PARAM_DEFAULTS[primitive] || {}), ...(obj.params.params || {}) };
      actualTransform = obj.params.transform || { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
    } else {
      eng.layers = eng.layers.filter((l) => l.parentId !== gid);
      g = eng.layers.find((l) => l.id === gid);
      g.isGroup = true; g.containerRole = 'scene';
      const q = g.params;
      q.camera = camera; q.ground = { enabled: false }; q.backdrop = { enabled: false };
      const bag = bagFor(primitive, rig);
      if (detailOverride) bag.detail = detailOverride;
      q.objects = [{ id: 'obj', name: 'Obj', primitive, params: bag, transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' }];
      q.lights = [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false }];
      const style = { penId: null, mapper, params: { fillAngle: 45, fillDensity: DENSITY[density], toneLaw: DEFAULT_STYLE } };
      q.styleTable = { scene: JSON.parse(JSON.stringify(style)), byObject: { obj: JSON.parse(JSON.stringify(style)) }, byFace: {} };
      objId = 'obj';
      actualBag = { ...bag };
      actualTransform = q.objects[0].transform;
    }
    eng.computeAllDisplayGeometry();
    const paths = (eng.getLayerById(gid).scenePaths) || [];
    const mine = (p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.objectId === objId && !p.meta.sceneTarget.occluded;
    const fill = paths.filter((p) => p.meta && p.meta.kind === 'sceneFill' && mine(p));
    const border = paths.filter((p) => p.meta && p.meta.kind === 'sceneEdge' && mine(p)
      && ['silhouette', 'boundary'].includes(p.meta.sceneTarget.edgeClass));
    return { paths, fill, border, objId, actualBag, actualTransform };
  };

  // Overshoot past the DRAWN outline (osDrawn) AND past the TRUE silhouette
  // (osTrue), for one cell. `poleMark`s a chart-pole cluster (>= 3 ends
  // within 0.3 mm) the same way scene3d-fill-boundary-ends.test.js does, so a
  // legitimate pole convergence is never scored as overshoot.
  const measureCell = (primitive, mapper, rig, angle, density, detailOverride) => {
    const { fill, border, actualBag, actualTransform } = build(primitive, mapper, rig, angle, density, detailOverride);
    const bp = [];
    border.forEach((p) => (p.points || p).forEach((pt) => { if (Number.isFinite(pt.x)) bp.push({ x: pt.x, y: pt.y }); }));
    if (bp.length < 3) return { primitive, mapper, rig, angle, density, error: 'no border ink', osDrawnMm: 0, osTrueMm: 0, liveEnds: 0 };
    const Hd = hull(bp);
    const Ht = trueHullFor(primitive, angle, actualBag, actualTransform);
    const ends = [];
    fill.forEach((p) => {
      const pts = p.points || p;
      if (!pts || pts.length < 2) return;
      const a = pts[0]; const b = pts[pts.length - 1];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 0.05) return;
      ends.push(a); ends.push(b);
    });
    const rec = ends.map((e) => ({ x: e.x, y: e.y, dd: sdHull(Hd, e.x, e.y), dt: sdHull(Ht, e.x, e.y) }));
    const POLE_MM = 0.3;
    const poleMark = rec.map(() => false);
    for (let i = 0; i < rec.length; i++) {
      if (poleMark[i]) continue;
      const grp = [i];
      for (let j = 0; j < rec.length; j++) { if (j !== i && Math.hypot(rec[i].x - rec[j].x, rec[i].y - rec[j].y) <= POLE_MM) grp.push(j); }
      if (grp.length >= 3) grp.forEach((k) => { poleMark[k] = true; });
    }
    const live = rec.filter((r, i) => !poleMark[i]);
    const dd = live.map((r) => r.dd); const dt = live.map((r) => r.dt);
    const mx = (a) => (a.length ? Math.max(...a) : 0);
    return {
      primitive, mapper, rig, angle, density, liveEnds: live.length,
      osDrawnMm: mx(dd), osTrueMm: mx(dt),
      overBarDrawn: dd.filter((d) => d > OVERSHOOT_BAR_MM).length,
    };
  };

  // Cache: every cell is built ONCE and reused across O1/O2/O3's assertions.
  const cache = new Map();
  const cellId = (primitive, mapper, rig, angle, density) => [primitive, mapper, rig, angle, density].join('__');
  const cellFor = (primitive, mapper, rig, angle, density) => {
    const id = cellId(primitive, mapper, rig, angle, density);
    if (!cache.has(id)) cache.set(id, measureCell(primitive, mapper, rig, angle, density));
    return cache.get(id);
  };

  const PRIMS = ['capsule', 'cone', 'cylinder', 'sphere', 'ellipsoid'];
  const MAPS = ['hatch', 'contour', 'crosshatch', 'spiral'];
  const ANGLES = ['a', 'b'];
  const DENS = ['med', 'max'];

  // ── O1 — overshoot past the DRAWN outline, `create` rig ──────────────────
  // "no ruling endpoint outside the [DRAWN] silhouette by more than 0.5 pen"
  // (W-32's own bar). RED today: 0.2172 mm, 41 ends over on
  // ellipsoid.hatch.a.d220 (W-32r4-plan.md §1.3).
  describe('O1 — overshoot past the DRAWN outline <= 0.15 mm (0.5 pen), create rig', () => {
    PRIMS.forEach((primitive) => MAPS.forEach((mapper) => ANGLES.forEach((angle) => DENS.forEach((density) => {
      test(`${primitive}·${mapper}·${angle}·${density} (create)`, () => {
        const r = cellFor(primitive, mapper, 'create', angle, density);
        expect(r.osDrawnMm).toBeLessThanOrEqual(OVERSHOOT_BAR_MM);
      });
    }))));

    // Mutation proof (W-32r4-plan.md §5.2 O1): the fix is ANALYTIC, so it
    // corrects a coarse (detail:8) mesh just as well as the create-rig
    // default — detail is not a valid mutation against the FIXED code path.
    // The oracle's sensitivity is proven instead by toggling the fix itself
    // at that same coarse detail: WITH the fix OFF, detail:8 fails O1's bar
    // by >= 3x (the pre-fix mechanism IS tessellation-sagitta-dependent,
    // W-32 §A3's detail sweep); WITH it ON, the same coarse mesh passes.
    // This proves the oracle correctly separates "fixed" from "unfixed"
    // rather than being vacuously green regardless of the code under test.
    test('MUTATION PROOF — with the fix OFF, detail:8 fails O1 by >= 3x; with it ON, the same coarse mesh passes', () => {
      runtime.window.__SIL_PROTO_OFF = true;
      const off = measureCell('sphere', 'hatch', 'create', 'a', 'med', 8);
      runtime.window.__SIL_PROTO_OFF = false;
      const on = measureCell('sphere', 'hatch', 'create', 'a', 'med', 8);
      expect(off.osDrawnMm).toBeGreaterThan(OVERSHOOT_BAR_MM);
      expect(on.osDrawnMm).toBeLessThanOrEqual(OVERSHOOT_BAR_MM);
      expect(off.osDrawnMm).toBeGreaterThanOrEqual(3 * Math.max(on.osDrawnMm, 1e-6));
    });
  });

  // ── O2 — the SAME bar on the `addLayer` rig ───────────────────────────────
  // The rig IS the mutation (W-32r4-plan.md §5.2 O2): a create-only bar is a
  // claim about one rig. RED today: 0.1564 mm, 15+26 ends over
  // (sphere/ellipsoid, W-32r4-plan.md §1.4).
  describe('O2 — overshoot past the DRAWN outline <= 0.15 mm (0.5 pen), addLayer rig', () => {
    PRIMS.forEach((primitive) => MAPS.forEach((mapper) => ANGLES.forEach((angle) => DENS.forEach((density) => {
      test(`${primitive}·${mapper}·${angle}·${density} (addLayer)`, () => {
        const r = cellFor(primitive, mapper, 'addLayer', angle, density);
        expect(r.osDrawnMm).toBeLessThanOrEqual(OVERSHOOT_BAR_MM);
      });
    }))));
  });

  // ── O3 — ANTI-CHEAT: overshoot vs the TRUE silhouette must stay small ────
  // Forbids the whole "trim the ruling ends inward" family (Rank 3, rejected
  // by measurement) from passing O1/O2 by pulling ink OFF the true surface.
  // GREEN today (<= 0.0035 mm measured) and MUST STAY GREEN.
  describe('O3 — anti-cheat: overshoot past the TRUE silhouette <= 0.05 mm, both rigs', () => {
    ['create', 'addLayer'].forEach((rig) => PRIMS.forEach((primitive) => MAPS.forEach((mapper) => ANGLES.forEach((angle) => DENS.forEach((density) => {
      test(`${primitive}·${mapper}·${angle}·${density} (${rig})`, () => {
        const r = cellFor(primitive, mapper, rig, angle, density);
        expect(r.osTrueMm).toBeLessThanOrEqual(TRUE_ANTI_CHEAT_MM);
      });
    })))));

    // Mutation proof + the ruled limitation of O1/O2 alone (W-32r4-plan.md
    // §5.2 O3, §426-428): insetting a ruling end 0.3 mm TOWARD the interior
    // makes O1 pass EVEN MORE trivially (the end is further from the drawn
    // hull's boundary) while O3 ALSO stays green (an inset end is still
    // inside the 0.05 mm true-silhouette band, not outside it) — i.e. O1
    // alone cannot distinguish "reached the true silhouette" from "clipped
    // short of it". O3 is not sufficient to catch that inward cheat either;
    // what makes the shipped fix honest is that fill ink is BYTE-IDENTICAL
    // (O4) — the ends were never moved to make O1 pass.
    test('DOCUMENTED LIMITATION — O1 alone cannot detect an inward-clipped end; O4 (fill immobility) is what rules it out', () => {
      const r = cellFor('sphere', 'hatch', 'create', 'a', 'med');
      const insetD = { x: 0, y: 0 };
      const insetDd = r.osDrawnMm - 0.3; // an end pulled 0.3mm further inside the drawn hull
      expect(insetDd).toBeLessThanOrEqual(OVERSHOOT_BAR_MM); // O1 "passes" (more trivially than ever)
      expect(r.osTrueMm).toBeLessThanOrEqual(TRUE_ANTI_CHEAT_MM); // O3 was already green and stays green
      void insetD;
    });
  });

  // ── O4 — FILL IMMOBILITY ──────────────────────────────────────────────────
  // The whole claim is that the fill was already correct; this fix touches
  // only the border. `sceneFill` md5 at 9dp must be byte-identical with the
  // fix ON vs OFF, on {5 primitives} x {4 mappers} (create rig, med density,
  // camera a). GREEN by construction (pre-fix ON/OFF are the same code path
  // since the toggle doesn't exist yet; post-fix the fix never touches a
  // fill point).
  describe('O4 — sceneFill is byte-identical with the fix ON vs OFF', () => {
    const digestFill = (paths) => {
      const h = crypto.createHash('md5');
      paths.forEach((p) => {
        if (!p.meta || p.meta.kind !== 'sceneFill') return;
        (p.points || p).forEach((pt) => h.update(pt.x.toFixed(9) + ',' + pt.y.toFixed(9) + ';'));
        h.update('|');
      });
      return h.digest('hex');
    };

    PRIMS.forEach((primitive) => MAPS.forEach((mapper) => {
      test(`${primitive}·${mapper} sceneFill md5 unchanged`, () => {
        runtime.window.__SIL_PROTO_OFF = true;
        const off = build(primitive, mapper, 'create', 'a', 'med').fill;
        runtime.window.__SIL_PROTO_OFF = false;
        const on = build(primitive, mapper, 'create', 'a', 'med').fill;
        expect(digestFill(on)).toBe(digestFill(off));
      });
    }));

    // Mutation proof (W-32r4-plan.md §5.2 O4): flip one fill point by a
    // fraction of a millimetre and the digest MUST change — proves the 9dp
    // md5 comparison is sensitive enough to catch a real leak, not a
    // vacuous "no throw" check.
    test('MUTATION PROOF — perturbing one fill point by 0.001 mm changes the digest', () => {
      runtime.window.__SIL_PROTO_OFF = false;
      const fill = build('sphere', 'hatch', 'create', 'a', 'med').fill;
      const before = digestFill(fill);
      const mutated = fill.map((p, i) => {
        if (i !== 0) return p;
        const pts = (p.points || p).map((pt, j) => (j === 0 ? { ...pt, x: pt.x + 0.001 } : pt));
        return { ...p, points: pts, meta: p.meta };
      });
      expect(digestFill(mutated)).not.toBe(before);
    });
  });

  // ── O5 — BYTE-IDENTITY of the excluded set ───────────────────────────────
  // Every faceted/unsupported primitive (box, plane, pyramid, solid,
  // superellipsoid, torusKnot), the torus (excluded by the convexity gate),
  // and the ground plane must be untouched — both sceneFill AND sceneEdge —
  // with the fix ON vs OFF, across every mapper. GREEN today (48/48 faceted
  // cells + torus + ground, W-32r4-plan.md §3.4).
  describe('O5 — sceneFill and sceneEdge are byte-identical on the excluded set', () => {
    const digestAll = (paths, kind) => {
      const h = crypto.createHash('md5');
      paths.forEach((p) => {
        if (kind && (!p.meta || p.meta.kind !== kind)) return;
        h.update((p.meta && p.meta.kind) || '?'); h.update('|');
        (p.points || p).forEach((pt) => h.update(pt.x.toFixed(9) + ',' + pt.y.toFixed(9) + ';'));
        h.update('\n');
      });
      return h.digest('hex');
    };
    const FACETED = ['box', 'plane', 'pyramid', 'solid', 'superellipsoid', 'torusKnot'];
    const ALL_MAPPERS = ['none', 'hatch', 'wireframe', 'crosshatch', 'contour', 'spiral', 'stipple', 'contourSlice'];

    FACETED.forEach((primitive) => ALL_MAPPERS.forEach((mapper) => {
      test(`${primitive}·${mapper} fully byte-identical (unsupported chart)`, () => {
        runtime.window.__SIL_PROTO_OFF = true;
        const off = build(primitive, mapper, 'create', 'a', 'med').paths;
        runtime.window.__SIL_PROTO_OFF = false;
        const on = build(primitive, mapper, 'create', 'a', 'med').paths;
        expect(digestAll(on)).toBe(digestAll(off));
      });
    }));

    ALL_MAPPERS.forEach((mapper) => {
      test(`torus·${mapper} fully byte-identical (excluded — non-convex, §3.3)`, () => {
        runtime.window.__SIL_PROTO_TORUS_ON = false;
        runtime.window.__SIL_PROTO_OFF = true;
        const off = build('torus', mapper, 'create', 'a', 'med').paths;
        runtime.window.__SIL_PROTO_OFF = false;
        const on = build('torus', mapper, 'create', 'a', 'med').paths;
        expect(digestAll(on)).toBe(digestAll(off));
      });
    });

    test('ground plane is byte-identical (excluded by record.id, §3.4)', () => {
      const buildWithGround = () => {
        const eng = new V.VectorEngine();
        eng.currentProfile = { width: W, height: H, name: 'w32r4-ground' };
        const gid = eng.addLayer('scene3d');
        eng.layers = eng.layers.filter((l) => l.parentId !== gid);
        const g = eng.layers.find((l) => l.id === gid);
        g.isGroup = true; g.containerRole = 'scene';
        const q = g.params;
        q.camera = { ...DEFAULT_CAMERA }; q.ground = { enabled: true }; q.backdrop = { enabled: false };
        const bag = bagFor('sphere', 'create');
        q.objects = [{ id: 'obj', name: 'Obj', primitive: 'sphere', params: bag, transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' }];
        q.lights = [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false }];
        const style = { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: DENSITY.med, toneLaw: DEFAULT_STYLE } };
        q.styleTable = { scene: JSON.parse(JSON.stringify(style)), byObject: { obj: JSON.parse(JSON.stringify(style)) }, byFace: {} };
        eng.computeAllDisplayGeometry();
        return (eng.getLayerById(gid).scenePaths) || [];
      };
      runtime.window.__SIL_PROTO_OFF = true;
      const off = buildWithGround().filter((p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.objectId === 'ground');
      runtime.window.__SIL_PROTO_OFF = false;
      const on = buildWithGround().filter((p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.objectId === 'ground');
      expect(digestAll(on)).toBe(digestAll(off));
    });

    // Mutation proof (W-32r4-plan.md §5.2 O5): with the test-only
    // __SIL_PROTO_TORUS_ON override bypassing the `mode !== 'torus'` gate,
    // the torus MUST move — proving the byte-identity above rests on the
    // gate being in place, not on the torus being unreachable by any path.
    test('MUTATION PROOF — bypassing the torus gate moves sceneEdge (proves the gate, not luck, keeps O5 green)', () => {
      runtime.window.__SIL_PROTO_OFF = true;
      const off = build('torus', 'contour', 'create', 'a', 'med').paths;
      runtime.window.__SIL_PROTO_OFF = false;
      runtime.window.__SIL_PROTO_TORUS_ON = true;
      const onGateBypassed = build('torus', 'contour', 'create', 'a', 'med').paths;
      runtime.window.__SIL_PROTO_TORUS_ON = false;
      expect(digestAll(onGateBypassed, 'sceneEdge')).not.toBe(digestAll(off, 'sceneEdge'));
    });

    afterAll(() => {
      runtime.window.__SIL_PROTO_OFF = false;
      runtime.window.__SIL_PROTO_TORUS_ON = false;
    });
  });
});
