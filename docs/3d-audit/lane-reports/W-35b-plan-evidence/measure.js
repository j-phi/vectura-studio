/* W-35b scout instrument — surface-fill ruling END position vs the DRAWN outline.
 * Read-only. Runs inside the scratch export.
 *
 * Reference: for a CONVEX primitive the drawn outline (silhouette+boundary
 * sceneEdge ink) is the convex hull of its projected mesh vertices, and the
 * emitted border segments' endpoints lie on it. So hull(border endpoints) IS
 * the drawn footprint, exactly (no raster, no flood fill).
 */
const path = require('path');
const { loadVecturaRuntime } = require(path.join(__dirname, '..', 'tests', 'helpers', 'load-vectura-runtime'));

const DENSITY = { low: 1, med: 50, max: 220 };
const SECOND_ANGLE = { yaw: 40, pitch: -15 };

function hull(pts) {
  const p = pts.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = []; for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up = []; for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
}
// signed distance to hull boundary: >0 outside
function sdHull(H, x, y) {
  let inside = true; let best = Infinity; let bestT = 0; let acc = 0; let bestAcc = 0;
  const n = H.length;
  for (let i = 0; i < n; i++) {
    const a = H[i]; const b = H[(i + 1) % n];
    const ex = b.x - a.x; const ey = b.y - a.y;
    const L = Math.hypot(ex, ey) || 1e-12;
    if (ex * (y - a.y) - ey * (x - a.x) < 0) inside = false;   // CCW hull
    let t = ((x - a.x) * ex + (y - a.y) * ey) / (L * L);
    t = Math.max(0, Math.min(1, t));
    const px = a.x + ex * t; const py = a.y + ey * t;
    const d = Math.hypot(x - px, y - py);
    if (d < best) { best = d; bestT = t; bestAcc = acc + t * L; }
    acc += L;
  }
  return { d: inside ? -best : best, s: bestAcc, perim: acc };
}
const quant = (arr, q) => { if (!arr.length) return 0; const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(q * (a.length - 1)))]; };

async function main() {
  const runtime = await loadVecturaRuntime();
  const V = runtime.window.Vectura;
  const P = V.Scene3D.Params;
  const DEFAULT_CAMERA = P.DEFAULT_CAMERA;
  const DEFAULT_STYLE = (V.SCENE_FILL_STYLES && V.SCENE_FILL_STYLES.DEFAULT) || 'ladder';

  const build = (primitive, mapper, rig, angle, density, extraStyle) => {
    const eng = new V.VectorEngine();
    eng.currentProfile = { width: 320, height: 220, name: 'w35b' };
    const camera = angle === 'a' ? { ...DEFAULT_CAMERA } : { ...DEFAULT_CAMERA, ...SECOND_ANGLE };
    const gid = eng.addLayer('scene3d');
    let g; let objId;
    if (rig === 'addLayer') {
      g = eng.layers.find((l) => l.id === gid);
      g.params.camera = camera; g.params.backdrop = { enabled: false };
      const gc = eng.getLayerDescendants(gid).find((l) => l && l.type === 'sceneGround3d');
      if (gc) gc.visible = false;
      const obj = eng.getLayerDescendants(gid).filter((l) => l && l.type === 'object3d')[0];
      obj.params.primitive = primitive;
      obj.params.style = obj.params.style || { penId: null, mapper, params: {} };
      obj.params.style.mapper = mapper;
      obj.params.style.params = { ...(obj.params.style.params || {}), fillAngle: 45, fillDensity: DENSITY[density], toneLaw: DEFAULT_STYLE, ...(extraStyle || {}) };
      objId = obj.id;
    } else {
      eng.layers = eng.layers.filter((l) => l.parentId !== gid);
      g = eng.layers.find((l) => l.id === gid);
      g.isGroup = true; g.containerRole = 'scene';
      const q = g.params;
      q.camera = camera; q.ground = { enabled: false }; q.backdrop = { enabled: false };
      const bag = { ...(P.PRIMITIVE_PARAM_DEFAULTS[primitive] || {}), ...(P.PRIMITIVE_CREATE_DEFAULTS[primitive] || {}) };
      q.objects = [{ id: 'obj', name: 'Obj', primitive, params: bag, transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' }];
      q.lights = [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false }];
      const style = { penId: null, mapper, params: { fillAngle: 45, fillDensity: DENSITY[density], toneLaw: DEFAULT_STYLE, ...(extraStyle || {}) } };
      q.styleTable = { scene: JSON.parse(JSON.stringify(style)), byObject: { obj: JSON.parse(JSON.stringify(style)) }, byFace: {} };
      objId = 'obj';
    }
    eng.computeAllDisplayGeometry();
    const paths = (eng.getLayerById(gid).scenePaths) || [];
    const mine = (p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.objectId === objId && !p.meta.sceneTarget.occluded;
    const fill = paths.filter((p) => p.meta && p.meta.kind === 'sceneFill' && mine(p));
    const border = paths.filter((p) => p.meta && p.meta.kind === 'sceneEdge' && mine(p)
      && ['silhouette', 'boundary'].includes(p.meta.sceneTarget.edgeClass));
    return { fill, border };
  };

  const PEN = 0.3;
  const measure = (primitive, mapper, rig, angle, density, extraStyle) => {
    const { fill, border } = build(primitive, mapper, rig, angle, density, extraStyle);
    const bp = [];
    border.forEach((p) => (p.points || p).forEach((pt) => { if (Number.isFinite(pt.x)) bp.push({ x: pt.x, y: pt.y }); }));
    if (bp.length < 3) return { primitive, mapper, rig, angle, density, error: 'no border ink', fillRuns: fill.length };
    const H = hull(bp);
    const ends = [];
    let closed = 0;
    fill.forEach((p) => {
      const pts = p.points || p;
      if (!pts || pts.length < 2) return;
      const a = pts[0]; const b = pts[pts.length - 1];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 0.05) { closed += 1; return; }
      ends.push(a); ends.push(b);
    });
    const rec = ends.map((e) => { const r = sdHull(H, e.x, e.y); return { x: e.x, y: e.y, d: r.d, s: r.s, perim: r.perim }; });
    // A chart POLE is where >= 3 rulings converge on ONE point (the same rule
    // tests/unit/scene3d-fill-boundary-ends.test.js uses). It is NOT a
    // silhouette end and must not be scored as one — on the capsule 13 ends
    // land on (160.0, 95.0), 0.84 mm INSIDE the hull, and unfiltered they
    // dominate every scatter statistic.
    const POLE_MM = 0.3;
    const poleMark = rec.map(() => false);
    for (let i = 0; i < rec.length; i++) {
      if (poleMark[i]) continue;
      const grp = [i];
      for (let j = 0; j < rec.length; j++) {
        if (j === i) continue;
        if (Math.hypot(rec[i].x - rec[j].x, rec[i].y - rec[j].y) <= POLE_MM) grp.push(j);
      }
      if (grp.length >= 3) grp.forEach((k) => { poleMark[k] = true; });
    }
    const poles = poleMark.filter(Boolean).length;
    // "silhouette ends" = non-pole ends whose nearest hull point is within 1.0 mm
    const sil = rec.filter((r, i) => !poleMark[i] && Math.abs(r.d) <= 1.0).sort((a, b) => a.s - b.s);
    const dsAll = rec.filter((r, i) => !poleMark[i]).map((r) => r.d);
    const ds = sil.map((r) => r.d);
    // stairstep: |Δd| between arclength-adjacent silhouette ends closer than 4 mm apart
    const deltas = [];
    for (let i = 1; i < sil.length; i++) {
      if (sil[i].s - sil[i - 1].s <= 4.0) deltas.push(Math.abs(sil[i].d - sil[i - 1].d));
    }
    // ROUGHNESS — the stairstep quantity. |d(i-1) - 2 d(i) + d(i+1)| over
    // arclength-consecutive triples whose two gaps are both <= 3 mm. The second
    // difference annihilates any SMOOTH trend (the sagitta ramp along a cone's
    // slant is exactly linear in s, step 0.0031 mm per ruling), so what survives
    // is only end-to-end raggedness — which is what "stairstepping" means.
    const rough = [];
    for (let i = 1; i < sil.length - 1; i++) {
      const g1 = sil[i].s - sil[i - 1].s; const g2 = sil[i + 1].s - sil[i].s;
      if (g1 > 3.0 || g2 > 3.0) continue;
      rough.push(Math.abs(sil[i - 1].d - (2 * sil[i].d) + sil[i + 1].d));
    }
    const mean = ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : 0;
    const sd = ds.length ? Math.sqrt(ds.reduce((a, b) => a + (b - mean) ** 2, 0) / ds.length) : 0;
    if (process.env.DUMP) {
      return { primitive, mapper, rig, angle, density, hullPerim: +(sil.length?sil[0].perim:0).toFixed(2),
        ends: sil.map((r) => ({ s: +r.s.toFixed(2), d: +r.d.toFixed(4), x: +r.x.toFixed(2), y: +r.y.toFixed(2) })) };
    }
    return {
      primitive, mapper, rig, angle, density,
      fillRuns: fill.length, closedRuns: closed, ends: rec.length, poleEnds: poles, silEnds: sil.length,
      interiorEnds: rec.filter((r, i) => !poleMark[i] && Math.abs(r.d) > 1.0).length,
      maxOvershoot: +Math.max(0, ...dsAll.map((d) => d)).toFixed(4),
      maxOvershootPen: +(Math.max(0, ...dsAll.map((d) => d)) / PEN).toFixed(2),
      over0p5pen: dsAll.filter((d) => d > 0.15).length,
      silMean: +mean.toFixed(4), silSd: +sd.toFixed(4), silSdPen: +(sd / PEN).toFixed(2),
      silMin: +Math.min(...(ds.length ? ds : [0])).toFixed(4), silMax: +Math.max(...(ds.length ? ds : [0])).toFixed(4),
      range: +((ds.length ? Math.max(...ds) - Math.min(...ds) : 0)).toFixed(4),
      rangePen: +((ds.length ? Math.max(...ds) - Math.min(...ds) : 0) / PEN).toFixed(2),
      stepMax: +(deltas.length ? Math.max(...deltas) : 0).toFixed(4),
      stepMaxPen: +((deltas.length ? Math.max(...deltas) : 0) / PEN).toFixed(2),
      stepP90: +quant(deltas, 0.9).toFixed(4), stepMed: +quant(deltas, 0.5).toFixed(4),
      nDeltas: deltas.length,
      roughMed: +quant(rough, 0.5).toFixed(4), roughP90: +quant(rough, 0.9).toFixed(4),
      roughMax: +(rough.length ? Math.max(...rough) : 0).toFixed(4),
      roughP90Pen: +(quant(rough, 0.9) / PEN).toFixed(3), roughMaxPen: +((rough.length ? Math.max(...rough) : 0) / PEN).toFixed(2),
      nRough: rough.length,
    };
  };

  const out = [];
  const prims = process.env.PRIMS ? process.env.PRIMS.split(',') : ['capsule', 'cone', 'cylinder'];
  const maps = process.env.MAPS ? process.env.MAPS.split(',') : ['hatch', 'contour', 'spiral'];
  const rigs = process.env.RIGS ? process.env.RIGS.split(',') : ['create', 'addLayer'];
  for (const rig of rigs) for (const primitive of prims) for (const mapper of maps) for (const angle of ['a', 'b']) {
    try { out.push(measure(primitive, mapper, rig, angle, process.env.DENS || 'med')); }
    catch (e) { out.push({ primitive, mapper, rig, angle, error: String(e && e.message || e) }); }
  }
  console.log(JSON.stringify(out, null, 1));
  runtime.cleanup();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
