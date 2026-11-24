/**
 * U7b — a curved CSG carve (box minus sphere / cylinder) shades each front face by its OWN light, like a plain box,
 * instead of one tone for the whole carved region. Faceted (box-box) CSG and every other path stay byte-identical.
 */
const crypto = require('crypto');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('curved CSG carve per-face tone (U7b)', () => {
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

  // R1 — the three visible PLANES of a curved carve are shaded by their own light, like a plain box.
  [['key light', null, 30, 20], ['side light', { az: 90, el: 30 }, -35, 30]].forEach(([name, light, yaw, pitch]) => {
    test(`planes of box minus sphere @${yaw}/${pitch}, ${name}: ink density follows each plane's tone band`, () => {
      const { g } = build({ yaw, pitch });
      const pr = params(g, light);
      const faces = bandedFaces(pr);
      const per = perBand(faces, fillInk(gen(pr)), (f) => f.plane);
      const bands = Object.keys(per).map(Number).sort((a, b) => a - b).filter((b) => per[b].area > 150);
      expect(bands.length).toBeGreaterThanOrEqual(2); // precondition: planes really span >= 2 tone bands
      for (let i = 0; i + 1 < bands.length; i += 1) {
        // darker band (lower index) is strictly denser than the next lighter one
        expect(per[bands[i]].dens).toBeGreaterThan(per[bands[i + 1]].dens);
      }
      const dark = per[bands[0]].dens; const light2 = per[bands[bands.length - 1]].dens;
      expect(dark).toBeGreaterThanOrEqual(1.3 * light2);
    });
  });

  // R2 — the BORE (curved wall) reads its own light too.
  test('bore of box minus cylinder @-35/30: the darkest tone band is >= 1.2x denser than every lighter band', () => {
    const { g } = build({ cutter: 'cylinder', yaw: -35, pitch: 30 });
    const pr = params(g, { az: 90, el: 30 });
    const faces = bandedFaces(pr);
    const per = perBand(faces, fillInk(gen(pr)), (f) => !f.plane);
    const bands = Object.keys(per).map(Number).sort((a, b) => a - b).filter((b) => per[b].area > 100);
    expect(bands.length).toBeGreaterThanOrEqual(2);
    // The darkest bore band is >= 1.2x denser than EVERY lighter band. (Adjacent lighter bands are not strictly ordered:
    // the bore strips are narrow, so their measured density carries +-15% edge noise; the planes test above is strict.)
    for (let i = 1; i < bands.length; i += 1) expect(per[bands[0]].dens).toBeGreaterThanOrEqual(1.2 * per[bands[i]].dens);
  });

  // R3 — everything that is not a curved, tone-on, line-mapper carve is byte-identical to the previous build. The
  // signatures were captured from the base commit (Node 24); `sphere new` is the one intended change.
  const PIN = {
    'boxbox hatch 30/20': '8af94019763b',
    'boxbox crosshatch 30/20': '922001ebd083',
    'boxbox default 30/20': '8af94019763b',
    'boxbox hatch -35/30': '3eaea579aa20',
    'boxbox crosshatch -35/30': '09073974b65e',
    'boxbox default -35/30': '3eaea579aa20',
    // E2 re-pin: a curved carve now splits per source face + a repaired crack-free mesh (intended look change).
    // U7c/U7d re-pin: the carved curved surface is ruled as rings (a bowl / bore; the dimple by surface arc length) instead of one straight family; flat planes unchanged.
    'sphere toneoff -35/30': '9b117cdb13ea',
    'sphere default -35/30 OLD': '26a34da4945b',
  };
  [[30, 20], [-35, 30]].forEach(([yaw, pitch]) => {
    [['hatch', 'hatch'], ['crosshatch', 'crosshatch'], ['default', undefined]].forEach(([nm, mapper]) => {
      test(`box minus box (faceted) ${nm} @${yaw}/${pitch} is byte-identical`, () => {
        const { g } = build({ cutterBox: true, yaw, pitch, mapper });
        expect(sig(gen(params(g, null, true)))).toBe(PIN[`boxbox ${nm} ${yaw}/${pitch}`]);
      });
    });
  });
  test('curved carve with tone OFF is byte-identical', () => {
    const { g } = build({ yaw: -35, pitch: 30, tone: { enabled: false } });
    expect(sig(gen(params(g, null, true)))).toBe(PIN['sphere toneoff -35/30']);
  });

  // R4/R5 — tone path engaged, bounded cluster count, and a union failure falls back to today's single region.
  test('curved carve tone-on engages <= 8 clusters; any cluster-union failure keeps today\'s single region', () => {
    const { g } = build({ yaw: -35, pitch: 30 });
    V.scene3dStats = {};
    const now = sig(gen(params(g, null, true)));
    const st = V.scene3dStats;
    // U7c: the curved surface is ruled as a bowl (no cluster union); the flat planes still tone-cluster (the last group is a plane).
    expect(st.csgBowlGroups).toBeGreaterThanOrEqual(1);
    expect(st.csgToneGroups).toBeGreaterThanOrEqual(1);
    expect(st.csgToneClusters).toBeGreaterThanOrEqual(1);
    expect(st.csgToneClusters).toBeLessThanOrEqual(8);
    // stub: the 1st union (whole-group boundary) works, every later one (the clusters) fails
    const FB = V.FillBoolean; const orig = FB.union; let n = 0;
    FB.union = (...a) => { n += 1; if (n > 1) throw new Error('stub'); return orig(...a); };
    try {
      V.scene3dStats = {};
      const fb = sig(gen(params(g, null, true)));
      expect(V.scene3dStats.csgToneClusters).toBeUndefined();
      expect(fb).toBe(PIN['sphere default -35/30 OLD']);
      expect(fb).not.toBe(now);
    } finally { FB.union = orig; }
  });
});
