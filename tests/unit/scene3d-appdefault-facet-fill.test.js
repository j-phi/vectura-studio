const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * THE FACETED TWIN OF `scene3d-appdefault-lit-floor.test.js`.
 *
 * That file takes the APP DEFAULT scene and pins that the CURVED fill keeps ink
 * on the lit side. This one takes the same scene, swaps in the primitives that
 * route through the FACETED path — `box`, `plane`, `solid` — and pins the same
 * thing per FACE, because per face is the only honest place to measure a fill
 * that is generated in each planar face's own plane.
 *
 * WHY PER FACE. Measuring a faceted object's free ends against its SILHOUETTE
 * reads every crease as a mid-object stop: a ruling that ends on the edge
 * between a cube's top and its side is a CORRECT end and sits deep inside the
 * outline. Measured that way the faceted primitives look like they stop 73-90 %
 * of the way in. Measured per face, every ruling already ran edge to edge
 * (worst free end 0.000 of the face's own scale, before AND after this fix) —
 * the defect was never truncation. It was that there were almost no rulings.
 *
 * WHAT WAS MEASURED, on the app default with ZERO parameter overrides:
 *
 *   box   face:+Y  40x40 mm, zone L, N.L 0.707   1 ruling   16.3 % bare, gap 12.5 mm
 *   box   face:+X  40x40 mm, zone M, N.L 0.500   2 rulings  19.8 % bare, gap 15.6 mm
 *   plane face:+Y  60x60 mm, zone L, N.L 0.707   1 ruling   77.2 % bare, gap 35.3 mm
 *   solid          4 of 16 visible facets carried NO fill at all
 *
 * TWO CAUSES, both fixed in `src/core/algorithms/scene3d.js`:
 *
 *   1. `faceIsGlint`'s relative gate is a TAUTOLOGY on a one-facet record
 *      (`t >= GLINT_REL * t`), so the `plane` primitive was 100 % specular
 *      glint and had its coverage cut by GLINT_GAIN_MULT. `ground` was excluded
 *      by id for exactly this reason; `plane` is the same one-quad geometry and
 *      was never covered by it.
 *   2. Round 10 gave this path `Regions.formCeiling` — the MOST ink a zone may
 *      carry — and no floor, so a facet could legally come out with one ruling.
 *      The carrier family now floors at a maximum PITCH that puts
 *      FACET_MIN_RULINGS rulings inside the facet, bounded above by that same
 *      zone ceiling.
 *
 * AND IT PINS WHAT A LAZY FIX WOULD DESTROY. A uniformly filled object clears
 * every "no bare paper" bar, so the ladder is pinned too: the dark faces must
 * still out-ink the lit ones, per face, on the object a user actually gets.
 */

describe('Scene3D — the APP DEFAULT scene fills its FACETED faces', () => {
  let runtime; let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });
  afterAll(() => runtime.cleanup());

  // The app-default scene, built by the app's own entry point. The only things
  // the caller may choose are the primitive and the mapper, because both are
  // flyout picks; everything else is the factory default.
  const appDefault = (primitive, mapper) => {
    const engine = new V.VectorEngine();
    const gid = engine.addLayer('scene3d');      // === addSceneTree()
    const group = engine.getLayerById(gid);
    const obj = engine.getLayerDescendants(gid).filter((l) => l.type === 'object3d')[0];
    if (primitive && primitive !== obj.params.primitive) {
      const P = V.Scene3D.Params;
      const prev = obj.params.primitive;
      obj.params.primitive = primitive;
      obj.params.params = P.buildPrimitiveParams(primitive, prev, null) || {};
    }
    if (mapper && mapper !== 'hatch') obj.params.style = { penId: null, mapper, params: {} };
    engine.computeAllDisplayGeometry();
    return { engine, group, obj, paths: group.scenePaths || [] };
  };

  const len = (p) => {
    let L = 0;
    for (let i = 1; i < p.length; i += 1) L += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    return L;
  };

  const polyArea = (poly) => {
    let a = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      a += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
    }
    return Math.abs(a) / 2;
  };
  const inPoly = (poly, x, y) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      if (((poly[i].y > y) !== (poly[j].y > y))
        && (x < (poly[j].x - poly[i].x) * (y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x)) c = !c;
    }
    return c;
  };
  const distEdge = (poly, x, y) => {
    let best = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const ax = poly[j].x; const ay = poly[j].y;
      const dx = poly[i].x - ax; const dy = poly[i].y - ay;
      const L2 = dx * dx + dy * dy || 1e-9;
      let t = ((x - ax) * dx + (y - ay) * dy) / L2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
      if (d < best) best = d;
    }
    return best;
  };

  // Every VISIBLE fill path of the object, grouped by the face it belongs to.
  // `pickPolygon` is the face's own projected outline, carried on the fill meta
  // by the emitter itself — so the face boundary this measures against is the
  // emitter's, not a re-derived one.
  const facesOf = (paths, objId) => {
    const by = new Map();
    paths.forEach((p) => {
      const m = p.meta || {}; const t = m.sceneTarget || {};
      if (m.kind !== 'sceneFill' || t.objectId !== objId || t.occluded) return;
      const poly = t.pickPolygon;
      if (!Array.isArray(poly) || poly.length < 3) return;
      const key = t.faceId == null ? '<null>' : t.faceId;
      if (!by.has(key)) by.set(key, { faceId: key, poly, normal: t.normal, fills: [] });
      by.get(key).fills.push(p);
    });
    return [...by.values()].map((f) => {
      const area = polyArea(f.poly);
      const ink = f.fills.reduce((s, p) => s + len(p), 0);
      return { ...f, area, ink, density: area > 0.01 ? ink / area : 0 };
    }).filter((f) => f.area > 1);
  };

  // Widest empty gap inside a face: 2 x the radius of the largest ink-free disc
  // whose centre is clear of the face rim (a ruling legitimately ends there).
  const widestGap = (face) => {
    const pts = [];
    face.fills.forEach((p) => {
      for (let i = 1; i < p.length; i += 1) {
        const a = p[i - 1]; const b = p[i];
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        const n = Math.max(1, Math.ceil(L / 0.4));
        for (let s = 0; s <= n; s += 1) pts.push({ x: a.x + (b.x - a.x) * s / n, y: a.y + (b.y - a.y) * s / n });
      }
    });
    if (!pts.length) return Infinity;
    let lo = { x: Infinity, y: Infinity }; let hi = { x: -Infinity, y: -Infinity };
    face.poly.forEach((q) => {
      lo = { x: Math.min(lo.x, q.x), y: Math.min(lo.y, q.y) };
      hi = { x: Math.max(hi.x, q.x), y: Math.max(hi.y, q.y) };
    });
    const step = Math.max(0.35, Math.sqrt(face.area) / 30);
    let worst = 0;
    for (let x = lo.x; x <= hi.x; x += step) {
      for (let y = lo.y; y <= hi.y; y += step) {
        if (!inPoly(face.poly, x, y)) continue;
        if (distEdge(face.poly, x, y) < 0.6) continue;
        let d = Infinity;
        for (let k = 0; k < pts.length; k += 1) {
          const dd = Math.hypot(pts[k].x - x, pts[k].y - y);
          if (dd < d) d = dd;
        }
        if (d > worst) worst = d;
      }
    }
    return worst * 2;
  };

  // Every ruling END that is not on its own face's boundary. This is the metric
  // the silhouette-based one gets wrong on a faceted object, and it is 0 both
  // before and after the fix — pinned so a future fix cannot buy ink by cutting
  // rulings short.
  const worstFreeEnd = (face) => {
    let worst = 0;
    face.fills.forEach((p) => {
      if (p.length < 2) return;
      if (Math.hypot(p[0].x - p[p.length - 1].x, p[0].y - p[p.length - 1].y) < 0.05) return;
      [p[0], p[p.length - 1]].forEach((q) => {
        const d = distEdge(face.poly, q.x, q.y) / Math.sqrt(face.area);
        if (d > worst) worst = d;
      });
    });
    return worst;
  };

  // The bar is the emitter's own sparse-end statement, the one `Regions`
  // publishes and `scene3d-appdefault-lit-floor` reads for the curved path:
  // litMaxPitchPen x pen. The faceted path is allowed a WIDER bar than the
  // curved one because its pitch is `hatchSpacing(Density)` — an absolute
  // millimetre ladder, authoritative by design — while the curved path derives
  // a masterPitch. At Density 50 the faceted nominal is 7.5 mm, so the bar here
  // is stated as a multiple of the published one and the residual is recorded
  // in the report rather than hidden by a bar drawn around the measurement.
  const bar = () => {
    const R = V.Scene3D.Regions;
    const pen = 0.3; // the default pen the app ships (SETTINGS.pens[0].width)
    return (Number.isFinite(R && R.LIT_MAX_PITCH_PEN) ? R.LIT_MAX_PITCH_PEN : 12) * pen;
  };

  test('the fixture really is the factory default (no test rig has crept in)', () => {
    const { group, obj } = appDefault('box', 'hatch');
    expect(obj.params.primitive).toBe('box');
    // PRIMITIVE_CREATE_DEFAULTS' box, reached through the panel's own swap
    // helper — pinned so this file cannot drift into a hand-built rig.
    expect(obj.params.params.sx).toBe(40);
    expect(obj.params.style.mapper).toBe('hatch');
    expect(group.params.tone.enabled).toBe(true);
    expect(group.params.camera.pitch).toBe(20);
  });

  // ── RGR ─────────────────────────────────────────────────────────────────────
  // primitive, faces expected to carry ink, per-face gap bar as a MULTIPLE of
  // the published bar. Measured (widest ink-free gap, mm, across all visible
  // faces of the app-default object):
  //
  //            before      after      bar
  //   box       30.63      22.84      25.2  (7.0 x)
  //   plane     70.68      14.97      16.6  (4.6 x)
  //   solid     17.80      10.26      11.5  (3.2 x)
  //
  // The bars sit just above the measured values, so this is a regression gate
  // and not a restatement of the fix. They are NOT at the curved path's own
  // 1.3 x: the residual is real and is recorded here rather than hidden by a
  // bar drawn around the measurement. Its cause is the faceted path's pitch
  // being `hatchSpacing(Density)` — 7.5 mm at the app default, an absolute
  // millimetre ladder that is authoritative by design — where the curved path
  // derives a masterPitch (1.49 mm on the same document). Reconciling those two
  // is a Density-scale decision, not a fill bug, and is out of this change.
  [
    ['box', 3, 7.0],
    ['plane', 1, 4.6],
    ['solid', 12, 3.2],
  ].forEach(([primitive, minFaces, slack]) => {
    test(`RGR — every visible ${primitive} face is RULED, not merely marked`, () => {
      const { obj, paths } = appDefault(primitive, 'hatch');
      const faces = facesOf(paths, obj.id);
      expect(faces.length).toBeGreaterThanOrEqual(minFaces);
      // Every face that draws at all draws a FILL: at least two rulings, and no
      // hole wider than the bar. Before the fix `plane` drew ONE ruling with a
      // 35.3 mm hole and `box face:+Y` drew ONE with a 12.5 mm hole.
      faces.forEach((f) => {
        expect(f.ink).toBeGreaterThan(0);
        expect(f.fills.length).toBeGreaterThanOrEqual(2);
        expect(widestGap(f)).toBeLessThanOrEqual(bar() * slack);
      });
    });
  });

  test('RGR — the plane primitive is not classified as one big specular glint', () => {
    // A one-facet record cannot have a highlight: there is no ink around it.
    // Before the fix the plane's single face was its own best mirror, took the
    // glint cap, and drew 22.4 mm of ink over 1231 mm2 of paper.
    const { obj, paths } = appDefault('plane', 'hatch');
    const faces = facesOf(paths, obj.id);
    expect(faces.length).toBe(1);
    expect(faces[0].fills.length).toBeGreaterThanOrEqual(3);
    // 141.1 mm after the fix against 22.4 mm before; the bar is set well under
    // it so a partial regression still shows.
    expect(faces[0].ink).toBeGreaterThan(80);
  });

  test('the fix did not flatten the shading: dark faces still out-ink lit ones', () => {
    // The cube shows three orientations under one sun. Ink per unit PROJECTED
    // area must still fall as the face turns toward the light — a uniformly
    // filled object would clear every bar above and is the failure this pins.
    const { group, obj, paths } = appDefault('box', 'hatch');
    const faces = facesOf(paths, obj.id);
    expect(faces.length).toBe(3);
    const R = V.Scene3D.Regions;
    const lights = [{ type: 'directional', azimuth: 135, elevation: 45, intensity: 1 }];
    const nl = (f) => R.combinedIntensity(f.normal, { x: 0, y: 0, z: 0 },
      (group.params.lights && group.params.lights.length) ? group.params.lights : lights);
    const rows = faces.slice().sort((a, b) => nl(a) - nl(b));
    // Darkest face is the densest, and readably so.
    expect(nl(rows[0])).toBeLessThan(nl(rows[rows.length - 1]));
    expect(rows[0].density).toBeGreaterThan(rows[rows.length - 1].density * 1.25);
  });

  test('a ruling still ends on its own face boundary, never in open face', () => {
    // The seam law, restated where a faceted fill can actually be judged. This
    // is 0.000 before AND after — pinned so no future fill buys its ink by
    // truncating rulings, and so the silhouette-based reading of this metric
    // (which reports 0.73-0.90 on the same drawing) is never used again.
    ['box', 'plane', 'solid'].forEach((primitive) => {
      const { obj, paths } = appDefault(primitive, 'hatch');
      const faces = facesOf(paths, obj.id);
      expect(faces.length).toBeGreaterThan(0);
      faces.forEach((f) => expect(worstFreeEnd(f)).toBeLessThanOrEqual(0.02));
    });
  });
});
