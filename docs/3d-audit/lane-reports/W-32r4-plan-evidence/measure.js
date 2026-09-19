/* W-32 Rank 4 planner instrument — ruling-end position vs TWO references:
 *   drawn  = the DRAWN outline (silhouette+boundary sceneEdge ink) = inscribed chord polygon
 *   true   = the TRUE projected silhouette = hull of the same primitive's chart at detail 200
 * Read-only; runs inside the scratch export. Derived from W-35b-plan-evidence/measure.js.
 */
const path = require('path');
const ROOT = process.env.ROOT || '/private/tmp/claude-501/scratch-W32r4';
const { loadVecturaRuntime } = require(path.join(ROOT, 'tests', 'helpers', 'load-vectura-runtime'));

const DENSITY = { low: 1, med: 50, max: 220 };
const SECOND_ANGLE = { yaw: 40, pitch: -15 };
const PEN = 0.3;
const REF_DETAIL = Number(process.env.REF_DETAIL || 200);

function hull(pts) {
  const p = pts.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = []; for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up = []; for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
}
function sdHull(H, x, y) {
  let inside = true; let best = Infinity; let acc = 0; let bestAcc = 0;
  const n = H.length;
  for (let i = 0; i < n; i++) {
    const a = H[i]; const b = H[(i + 1) % n];
    const ex = b.x - a.x; const ey = b.y - a.y;
    const L = Math.hypot(ex, ey) || 1e-12;
    if (ex * (y - a.y) - ey * (x - a.x) < 0) inside = false;
    let t = ((x - a.x) * ex + (y - a.y) * ey) / (L * L);
    t = Math.max(0, Math.min(1, t));
    const px = a.x + ex * t; const py = a.y + ey * t;
    const d = Math.hypot(x - px, y - py);
    if (d < best) { best = d; bestAcc = acc + t * L; }
    acc += L;
  }
  return { d: inside ? -best : best, s: bestAcc, perim: acc };
}
const quant = (arr, q) => { if (!arr.length) return 0; const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(q * (a.length - 1)))]; };

async function main() {
  const runtime = await loadVecturaRuntime();
  if (process.env.PROTO === 'off') runtime.window.__SIL_PROTO_OFF = true;
  const V = runtime.window.Vectura;
  const P = V.Scene3D.Params;
  const Scene = V.Scene3D.Scene;
  const DEFAULT_CAMERA = P.DEFAULT_CAMERA;
  const DEFAULT_STYLE = (V.SCENE_FILL_STYLES && V.SCENE_FILL_STYLES.DEFAULT) || 'ladder';
  const W = 320; const H = 220;

  const CAM = (angle) => (angle === 'a' ? { ...DEFAULT_CAMERA }
    : angle === 'b' ? { ...DEFAULT_CAMERA, ...SECOND_ANGLE }
      : { ...DEFAULT_CAMERA, projection: 'perspective' });
  const bagFor = (primitive, rig) => (rig === 'addLayer'
    ? { ...(P.PRIMITIVE_PARAM_DEFAULTS[primitive] || {}) }
    : { ...(P.PRIMITIVE_PARAM_DEFAULTS[primitive] || {}), ...(P.PRIMITIVE_CREATE_DEFAULTS[primitive] || {}) });

  // TRUE silhouette reference: project the SAME chart at REF_DETAIL and hull it.
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

  const build = (primitive, mapper, rig, angle, density, extraStyle, detailOverride) => {
    const eng = new V.VectorEngine();
    eng.currentProfile = { width: W, height: H, name: 'w32r4' };
    const camera = CAM(angle);
    const gid = eng.addLayer('scene3d');
    let g; let objId; let actualBag = null; let actualTransform = null;
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
      obj.params.style.params = { ...(obj.params.style.params || {}), fillAngle: 45, fillDensity: DENSITY[density], toneLaw: DEFAULT_STYLE, ...(extraStyle || {}) };
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
      const style = { penId: null, mapper, params: { fillAngle: 45, fillDensity: DENSITY[density], toneLaw: DEFAULT_STYLE, ...(extraStyle || {}) } };
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
    let inkFill = 0; let inkEdge = 0;
    const len = (p) => { const pts = p.points || p; let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return L; };
    paths.forEach((p) => { if (!p.meta) return; if (p.meta.kind === 'sceneFill') inkFill += len(p); if (p.meta.kind === 'sceneEdge') inkEdge += len(p); });
    return { fill, border, inkFill, inkEdge, nPaths: paths.length, objId, actualBag, actualTransform };
  };

  const measure = (primitive, mapper, rig, angle, density, detailOverride) => {
    const { fill, border, inkFill, inkEdge, actualBag, actualTransform } = build(primitive, mapper, rig, angle, density, null, detailOverride);
    const bp = [];
    border.forEach((p) => (p.points || p).forEach((pt) => { if (Number.isFinite(pt.x)) bp.push({ x: pt.x, y: pt.y }); }));
    if (bp.length < 3) return { primitive, mapper, rig, angle, density, error: 'no border ink' };
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
    const rec = ends.map((e) => ({ x: e.x, y: e.y, dd: sdHull(Hd, e.x, e.y).d, dt: sdHull(Ht, e.x, e.y).d, s: sdHull(Hd, e.x, e.y).s }));
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
    // border-vs-true gap: how far the DRAWN outline sits inside the TRUE silhouette
    const vgaps = Hd.map((v) => -sdHull(Ht, v.x, v.y).d);
    const mgaps = [];
    for (let i = 0; i < Hd.length; i++) {
      const a = Hd[i]; const b = Hd[(i + 1) % Hd.length];
      for (const t of [0.25, 0.5, 0.75]) mgaps.push(-sdHull(Ht, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t).d);
    }
    const gaps = vgaps.concat(mgaps);
    const mx = (a) => (a.length ? Math.max(...a) : 0);
    // W-35's stair-step quantity, measured against the DRAWN outline: the second
    // difference of end position over arclength-consecutive silhouette ends.
    const sil = live.filter((r) => Math.abs(r.dd) <= 1.0).sort((a, b) => a.s - b.s);
    const rough = [];
    for (let i = 1; i < sil.length - 1; i++) {
      const g1 = sil[i].s - sil[i - 1].s; const g2 = sil[i + 1].s - sil[i].s;
      if (g1 > 3.0 || g2 > 3.0) continue;
      rough.push(Math.abs(sil[i - 1].dd - (2 * sil[i].dd) + sil[i + 1].dd));
    }
    return {
      primitive, mapper, rig, angle, density, detail: (actualBag && actualBag.detail) || null,
      fillRuns: fill.length, ends: rec.length, poleEnds: poleMark.filter(Boolean).length, liveEnds: live.length,
      osDrawnMm: +mx(dd).toFixed(4), osDrawnPen: +(mx(dd) / PEN).toFixed(2),
      overHalfPenDrawn: dd.filter((d) => d > 0.15).length,
      osTrueMm: +mx(dt).toFixed(4), osTruePen: +(mx(dt) / PEN).toFixed(2),
      overHalfPenTrue: dt.filter((d) => d > 0.15).length,
      borderInsideTrueMaxMm: +mx(gaps).toFixed(4), borderInsideTruePen: +(mx(gaps) / PEN).toFixed(2),
      borderVertexInsideTrueMm: +mx(vgaps).toFixed(4), borderVertexInsideTruePen: +(mx(vgaps) / PEN).toFixed(2),
      inkFillMm: +inkFill.toFixed(3), inkEdgeMm: +inkEdge.toFixed(3),
      ddP90: +quant(dd, 0.9).toFixed(4), dtP90: +quant(dt, 0.9).toFixed(4),
      roughP90Pen: +(quant(rough, 0.9) / PEN).toFixed(3),
      roughMaxPen: +((rough.length ? Math.max(...rough) : 0) / PEN).toFixed(2), nRough: rough.length,
    };
  };

  const prims = (process.env.PRIMS || 'capsule,cone,cylinder,sphere,ellipsoid').split(',');
  const maps = (process.env.MAPS || 'hatch,contour,crosshatch,spiral').split(',');
  const rigs = (process.env.RIGS || 'create,addLayer').split(',');
  const angles = (process.env.ANGLES || 'a,b').split(',');
  const dens = (process.env.DENS || 'med').split(',');
  const detailOverride = process.env.DETAIL ? Number(process.env.DETAIL) : null;
  const out = [];
  for (const rig of rigs) for (const primitive of prims) for (const mapper of maps) for (const angle of angles) for (const d of dens) {
    try { out.push(measure(primitive, mapper, rig, angle, d, detailOverride)); }
    catch (e) { out.push({ primitive, mapper, rig, angle, density: d, error: String((e && e.message) || e) }); }
  }
  console.log(JSON.stringify(out, null, 1));
  runtime.cleanup();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
