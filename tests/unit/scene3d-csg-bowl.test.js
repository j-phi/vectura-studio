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
      faces.push({ key: `${Math.round(n.x * 20)}_${Math.round(n.y * 20)}_${Math.round(n.z * 20)}`, n, I, band: R.band(I, tone), poly: withBox(poly) });
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

  // ---- U7d: the dimple floor is filled, the crosshatch is a grid, the dark side is clearly denser ----
  const polyline = (ink) => ink.filter((q) => q.length > 1);
  const segCross = (a, b, c, d) => {
    const r = { x: b.x - a.x, y: b.y - a.y }; const t = { x: d.x - c.x, y: d.y - c.y };
    const den = r.x * t.y - r.y * t.x;
    if (Math.abs(den) < 1e-9) return null;
    const u = ((c.x - a.x) * t.y - (c.y - a.y) * t.x) / den; const v = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    return { u, v, ang: Math.acos(Math.min(1, Math.abs(r.x * t.x + r.y * t.y) / (Math.hypot(r.x, r.y) * Math.hypot(t.x, t.y)))) * 180 / Math.PI };
  };
  const bowlOf = (mapper, light, cutter = 'sphere') => {
    const { g } = build({ cutter, yaw: -35, pitch: 30, mapper });
    const pr = params(g, light);
    const faces = bandedFaces(pr);
    return { pr, faces, bowl: faces.filter((f) => !f.plane), ink: polyline(fillInk(gen(pr))) };
  };
  // Largest bare patch of the bowl: the greatest distance from any point inside the dimple to the nearest ink, as a share of the
  // dimple's width. A floor left empty by widely spaced rings shows up here; an evenly ruled bowl keeps it small.
  const bareShare = (bowl, ink) => {
    const polys = bowl.map((f) => f.poly);
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    polys.forEach((q) => { x0 = Math.min(x0, q.x0); y0 = Math.min(y0, q.y0); x1 = Math.max(x1, q.x1); y1 = Math.max(y1, q.y1); });
    const pts = [];
    ink.forEach((p) => {
      for (let i = 0; i + 1 < p.length; i += 1) {
        const a = p[i]; const b = p[i + 1]; const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.4));
        for (let k = 0; k <= n; k += 1) pts.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n });
      }
    });
    let worst = 0;
    for (let x = Math.floor(x0); x < x1; x += 1) for (let y = Math.floor(y0); y < y1; y += 1) {
      if (!covers(polys, x + 0.5, y + 0.5)) continue;
      let d = Infinity;
      for (let i = 0; i < pts.length; i += 1) d = Math.min(d, Math.hypot(pts[i].x - x - 0.5, pts[i].y - y - 0.5));
      worst = Math.max(worst, d);
    }
    return worst / Math.max(x1 - x0, y1 - y0);
  };
  test('dimple floor: no bare patch wider than a tenth of the dimple (the middle of the bowl gets rings too)', () => {
    const { bowl, ink } = bowlOf('hatch', { az: 90, el: 30 });
    const r = bareShare(bowl, ink);
    require('fs').appendFileSync(process.env.BOWL_LOG || '/dev/null', `bare ${r.toFixed(3)}\n`);
    // previous build 0.128 (empty floor); sphere-arc rings 0.081
    expect(r).toBeLessThan(0.1);
  });
  test('dimple crosshatch: the two families cross at near right angles (a grid, not loose loops)', () => {
    const { bowl, ink } = bowlOf('crosshatch', { az: 90, el: 30 });
    const inside = ink.filter((p) => covers(bowl.map((f) => f.poly), p[Math.floor(p.length / 2)].x, p[Math.floor(p.length / 2)].y));
    const angs = [];
    for (let a = 0; a < inside.length; a += 1) for (let b = a + 1; b < inside.length; b += 1) {
      for (let i = 0; i + 1 < inside[a].length; i += 1) for (let j = 0; j + 1 < inside[b].length; j += 1) {
        const c = segCross(inside[a][i], inside[a][i + 1], inside[b][j], inside[b][j + 1]);
        if (c) angs.push(c.ang);
      }
    }
    const good = angs.filter((x) => x >= 55).length;
    require('fs').appendFileSync(process.env.BOWL_LOG || '/dev/null', `cross n=${angs.length} good=${good} share=${(good / Math.max(1, angs.length)).toFixed(3)}\n`);
    // previous build: 24 crossings, 0.79 near-perpendicular (loose loops); rings x meridians: 73, 0.945
    expect(angs.length).toBeGreaterThanOrEqual(40);
    expect(good / angs.length).toBeGreaterThanOrEqual(0.9);
  });
  test('dimple side light: the dark side carries clearly more ink than the lit side', () => {
    const { faces, ink } = bowlOf('hatch', { az: 90, el: 30 });
    const per = perBand(faces, ink, (f) => !f.plane);
    const bands = Object.keys(per).map(Number).sort((a, b) => a - b).filter((b) => per[b].area > 60);
    const ratio = per[bands[0]].dens / per[bands[bands.length - 1]].dens;
    require('fs').appendFileSync(process.env.BOWL_LOG || '/dev/null', `side ratio ${ratio.toFixed(3)} bands ${bands.join(',')}\n`);
    expect(bands.length).toBeGreaterThanOrEqual(2);
    // previous build 2.02, now 2.42
    expect(ratio).toBeGreaterThanOrEqual(2.2);
  });

  // ---- U7e: smooth strokes only (straight lines or smooth curves, never polygonal / jagged) ----
  // Largest turning angle between consecutive segments of every stroke that lies inside the dimple.
  const maxTurn = (bowl, ink) => {
    const polys = bowl.map((f) => f.poly);
    let worst = 0; let strokes = 0;
    ink.forEach((p) => {
      const mid = p[Math.floor(p.length / 2)];
      if (!covers(polys, mid.x, mid.y)) return;
      strokes += 1;
      const seg = [];
      for (let i = 0; i + 1 < p.length; i += 1) if (Math.hypot(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y) > 0.05) seg.push([p[i + 1].x - p[i].x, p[i + 1].y - p[i].y]);
      for (let i = 0; i + 1 < seg.length; i += 1) {
        const c = (seg[i][0] * seg[i + 1][0] + seg[i][1] * seg[i + 1][1]) / (Math.hypot(...seg[i]) * Math.hypot(...seg[i + 1]));
        worst = Math.max(worst, Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI);
      }
    });
    return { worst, strokes };
  };
  ['hatch', 'crosshatch'].forEach((mapper) => {
    test(`dimple ${mapper}: strokes are smooth (max turning angle between consecutive segments < 6 degrees)`, () => {
      const { bowl, ink } = bowlOf(mapper, { az: 90, el: 30 });
      const r = maxTurn(bowl, ink);
      require('fs').appendFileSync(process.env.BOWL_LOG || '/dev/null', `turn ${mapper} ${r.worst.toFixed(2)} strokes ${r.strokes}\n`);
      expect(r.strokes).toBeGreaterThanOrEqual(8);
      expect(r.worst).toBeLessThan(6);
    });
  });

  // Clipping / hidden-line removal still work on the analytic strokes: they stay inside the carved region (a stroke that
  // strayed onto the flat faces or the far hemisphere would leave the dimple's projected faces).
  test('dimple strokes are clipped to the carved region (<= 4% of stroke points outside the dimple faces)', () => {
    const { bowl, ink } = bowlOf('crosshatch', { az: 90, el: 30 });
    const polys = bowl.map((f) => f.poly);
    let inn = 0; let out = 0;
    ink.forEach((p) => {
      const mid = p[Math.floor(p.length / 2)];
      if (!covers(polys, mid.x, mid.y)) return;
      p.forEach((q) => { if (covers(polys, q.x, q.y)) inn += 1; else out += 1; });
    });
    expect(inn).toBeGreaterThan(200);
    expect(out / (inn + out)).toBeLessThanOrEqual(0.04);
  });

  // U7f — the bore follows the same rule: analytic circles (rings) and straight generators, no polygonal strokes.
  ['hatch', 'crosshatch'].forEach((mapper) => {
    test(`bore ${mapper}: strokes are smooth (max turning angle < 6 degrees) and clipped to the bore`, () => {
      const { bowl: all, ink } = bowlOf(mapper, { az: 90, el: 30 }, 'cylinder');
      const bowl = all.filter((f) => Math.abs(f.n.y) < 0.15); // the cylinder runs along world y: its wall faces have no y component
      const r = maxTurn(bowl, ink);
      require('fs').appendFileSync(process.env.BOWL_LOG || '/dev/null', `boreturn ${mapper} ${r.worst.toFixed(2)} strokes ${r.strokes}\n`);
      const polysB = bowl.map((f) => f.poly);
      const curved = ink.filter((p) => p.length >= 20 && covers(polysB, p[Math.floor(p.length / 2)].x, p[Math.floor(p.length / 2)].y)).length;
      require('fs').appendFileSync(process.env.BOWL_LOG || '/dev/null', `borecurved ${mapper} ${curved}\n`);
      expect(curved).toBeGreaterThanOrEqual(6); // the bore is ruled by long curved rings (previous build: straight flat hatch, 0)
      expect(r.worst).toBeLessThan(6);
      const polys = bowl.map((f) => f.poly);
      let inn = 0; let out = 0;
      ink.forEach((p) => {
        const mid = p[Math.floor(p.length / 2)];
        if (!covers(polys, mid.x, mid.y)) return;
        p.forEach((q) => { if (covers(polys, q.x, q.y)) inn += 1; else out += 1; });
      });
      require('fs').appendFileSync(process.env.BOWL_LOG || '/dev/null', `boreclip ${mapper} ${(out / Math.max(1, inn + out)).toFixed(3)} n=${inn}\n`);
      expect(out / (inn + out)).toBeLessThanOrEqual(0.04);
    });
  });
});
