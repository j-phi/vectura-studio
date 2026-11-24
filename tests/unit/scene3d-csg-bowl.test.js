/**
 * U7c — the hatch inside a curved CSG carve (box minus sphere = dimple, box minus cylinder = bore) follows the surface's
 * curvature (rings cut by world planes) instead of one screen-straight family, and its ink still follows N.L.
 */
const crypto = require('crypto');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('curved CSG carve reads as a bowl / bore (U7c)', () => {
  let runtime; let V;
  beforeAll(async () => { runtime = await loadVecturaRuntime({ includeRenderer: true }); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true, penWidth: 0.3 };

  const build = ({ cutter = 'sphere', cutterBox = false, yaw = 30, pitch = 20, mapper, tone }) => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneTree();
    const a = engine.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    a.params.primitive = 'box'; a.params.params = { sx: 50, sy: 50, sz: 50 };
    a.params.transform = { ...a.params.transform, yaw, pitch, roll: 0 };
    {
      const bId = engine.addObjectToScene(gid, cutterBox ? 'box' : cutter);
      const b = engine.getLayerById(bId);
      b.params.transform = { ...b.params.transform, x: 12, y: a.params.transform.y, z: 12 };
      b.params.params = cutterBox ? { sx: 30, sy: 30, sz: 30 }
        : cutter === 'cylinder' ? { radius: 14, height: 80, detail: 28 } : { radius: 22, detail: 28 };
      if (mapper) [a, b].forEach((l) => { l.params.style = { penId: null, mapper, params: { markSpace: 'pose' } }; });
      engine.createBooleanGroupFromSelection([a.id, bId]);
    }
    const g = engine.getLayerById(gid);
    if (tone) g.params.tone = { ...(g.params.tone || {}), ...tone };
    engine.generate(gid);
    return { engine, g };
  };
  const params = (g, light, raw) => {
    const pr = V.Scene3D.Params.normalizeParams(g._sceneAssembled);
    pr.ground = { ...(pr.ground || {}), enabled: false };
    if (raw) return pr;
    // The oracle reads the SAME params it generates from; shadows are off so intensity is a pure function of the normal.
    pr.lights = pr.lights.map((l) => ({ ...l, castShadows: false, ...(light ? { azimuth: light.az, elevation: light.el } : {}) }));
    return pr;
  };
  const gen = (pr) => V.AlgorithmRegistry.scene3d.generate(pr, null, null, BOUNDS) || [];
  const fillInk = (paths) => paths.filter((p) => {
    const m = p.meta || {}; const t = m.sceneTarget;
    return m.kind === 'sceneFill' && t && t.objectId !== 'ground';
  });
  const sig = (paths, d = 9) => crypto.createHash('sha1').update(JSON.stringify(paths.map((p) => [
    (p.meta && p.meta.kind) || '', p.map((q) => [+q.x.toFixed(d), +q.y.toFixed(d)])]))).digest('hex').slice(0, 12);
  const inPoly = (x, y, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i]; const b = poly[j];
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  };
  const withBox = (poly) => {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    poly.forEach((q) => { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); });
    return { poly, x0, y0, x1, y1 };
  };
  const covers = (polys, x, y) => polys.some((q) => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1 && inPoly(x, y, q.poly));
  // Ink length per mm^2 inside a set of projected front-face polygons (independent raster oracle, no boolean library).
  const density = (polys, ink) => {
    let area = 0; let len = 0;
    for (let x = 0; x < 320; x += 1) for (let y = 0; y < 220; y += 1) if (covers(polys, x + 0.5, y + 0.5)) area += 1;
    ink.forEach((p) => {
      for (let i = 0; i + 1 < p.length; i += 1) {
        const a = p[i]; const b = p[i + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.5));
        const seg = Math.hypot(b.x - a.x, b.y - a.y) / n;
        for (let k = 0; k < n; k += 1) if (covers(polys, a.x + (b.x - a.x) * (k + 0.5) / n, a.y + (b.y - a.y) * (k + 0.5) / n)) len += seg;
      }
    });
    return { area, dens: area ? len / area : 0 };
  };
  // Front faces of the carve split into PLANES (a quantised world normal shared by >= 100 BSP triangles) and BORE faces
  // (everything else), each tagged with its tone band by the production formula (Regions.shade, v2).
  const bandedFaces = (pr) => {
    const scene = V.Scene3D.Scene.assembleScene(pr, BOUNDS);
    const R = V.Scene3D.Regions;
    const rec = scene.objects[0];
    const tone = pr.tone;
    const faces = [];
    rec.faces.forEach((face, fi) => {
      if (!face.front) return;
      const n = face.normalWorld;
      const poly = rec.faceIndexArrays[fi].map((k) => rec.projected[k]);
      const I = R.shade(n, { x: 0, y: 0, z: 0 }, pr.lights, { model: 'v2', eye: null, ambient: tone.ambient, bounce: tone.bounce }).L;
      faces.push({ key: `${Math.round(n.x * 20)}_${Math.round(n.y * 20)}_${Math.round(n.z * 20)}`, I, band: R.band(I, tone), poly: withBox(poly) });
    });
    const count = {}; faces.forEach((f) => { count[f.key] = (count[f.key] || 0) + 1; });
    faces.forEach((f) => { f.plane = count[f.key] >= 100; });
    return faces;
  };
  const perBand = (faces, ink, pick) => {
    const bands = {};
    faces.filter(pick).forEach((f) => { (bands[f.band] = bands[f.band] || []).push(f); });
    const out = {};
    Object.keys(bands).forEach((b) => { out[b] = density(bands[b].map((f) => f.poly), ink); out[b].I = bands[b].reduce((a, f) => a + f.I, 0) / bands[b].length; });
    return out;
  };


  // Direction spread of the ink that lies inside the BORE (curved) faces: fraction of ink length within 15 degrees of the
  // dominant direction. One straight family -> ~1.0; curvature-following rings -> well below.
  const dominantShare = (polys, ink) => {
    const bins = new Array(36).fill(0); let tot = 0;
    ink.forEach((p) => {
      for (let i = 0; i + 1 < p.length; i += 1) {
        const a = p[i]; const b = p[i + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 1e-6 || !covers(polys, (a.x + b.x) / 2, (a.y + b.y) / 2)) continue;
        let ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; ang = ((ang % 180) + 180) % 180;
        bins[Math.floor(ang / 5) % 36] += len; tot += len;
      }
    });
    let best = 0;
    for (let c = 0; c < 36; c += 1) { let s = 0; for (let k = -3; k <= 3; k += 1) s += bins[(c + k + 36) % 36]; best = Math.max(best, s); }
    return { share: tot ? best / tot : 1, tot };
  };
  [['dimple', 'sphere']].forEach(([nm, cutter]) => {
    ['hatch', 'crosshatch'].forEach((mapper) => {
      test(`${nm} ${mapper}: ink inside the curved surface spans many screen directions (curvature-following)`, () => {
        const { g } = build({ cutter, yaw: -35, pitch: 30, mapper });
        const pr = params(g, { az: 90, el: 30 });
        const faces = bandedFaces(pr).filter((f) => !f.plane);
        const r = dominantShare(faces.map((f) => f.poly), fillInk(gen(pr)));
        expect(r.tot).toBeGreaterThan(30);
        // base build: hatch 0.77 / crosshatch 0.47 (one straight family); rings: 0.47 / 0.33
        expect(r.share).toBeLessThan(mapper === 'hatch' ? 0.6 : 0.4);
      });
    });
  });
  test('dimple: ink density inside the curved surface falls as the wall faces the light (darker bands denser)', () => {
    const { g } = build({ cutter: 'sphere', yaw: -35, pitch: 30, mapper: 'hatch' });
    const pr = params(g, { az: 90, el: 30 });
    const faces = bandedFaces(pr);
    const per = perBand(faces, fillInk(gen(pr)), (f) => !f.plane);
    const bands = Object.keys(per).map(Number).sort((a, b) => a - b).filter((b) => per[b].area > 60);
    expect(bands.length).toBeGreaterThanOrEqual(2);
    expect(per[bands[0]].dens).toBeGreaterThan(1.15 * per[bands[bands.length - 1]].dens);
  });
});
