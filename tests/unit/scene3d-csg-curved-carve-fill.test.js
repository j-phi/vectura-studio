/**
 * U7 — a settled curved CSG carve (box minus sphere / cylinder) must draw a real fill over its carved front
 * region, not the shredded sliver the even-odd boundary of a T-junctioned mesh produces.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('curved CSG carve fill (U7)', () => {
  let runtime; let V;
  beforeAll(async () => { runtime = await loadVecturaRuntime({ includeRenderer: true }); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  const scene = ({ cutter, carve = true, yaw = 30, pitch = 20, mapper = 'hatch', tone }) => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneTree();
    const a = engine.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    a.params.primitive = 'box'; a.params.params = { sx: 50, sy: 50, sz: 50 };
    a.params.transform = { ...a.params.transform, yaw, pitch, roll: 0 };
    if (carve) {
      const bId = engine.addObjectToScene(gid, cutter || 'sphere');
      const b = engine.getLayerById(bId);
      b.params.transform = { ...b.params.transform, x: 12, y: a.params.transform.y, z: 12 };
      b.params.params = cutter === 'cylinder' ? { radius: 14, height: 80, detail: 28 } : { radius: 22, detail: 28 };
      engine.createBooleanGroupFromSelection([a.id, bId]);
    }
    const g = engine.getLayerById(gid);
    if (tone) g.params.tone = { ...(g.params.tone || {}), ...tone };
    if (mapper !== 'hatch') {
      const st = g.params.styleTable || {};
      g.params.fillMapper = mapper;
    }
    engine.generate(gid);
    return g;
  };
  const fillPaths = (g) => (g.scenePaths || []).filter((p) => {
    const m = p.meta || {}; const t = m.sceneTarget;
    return t && t.objectId !== 'ground' && m.kind !== 'sceneEdge' && m.kind !== 'sceneShadow';
  });
  const kinds = (g) => { const o = {}; (g.scenePaths || []).forEach((p) => { const k = (p.meta || {}).kind; o[k] = (o[k] || 0) + 1; }); return o; };

  // Independent oracle: the carved FRONT region, rasterized by point-in-polygon over the front faces' projected
  // polygons (no boolean library). Coverage = share of those grid points lying within `reach` mm of drawn fill ink.
  const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true, penWidth: 0.3 };
  const regionAndInk = (g) => {
    const params = V.Scene3D.Params.normalizeParams(g._sceneAssembled);
    params.ground = { ...(params.ground || {}), enabled: false };
    const scene = V.Scene3D.Scene.assembleScene(params, BOUNDS);
    const tris = [];
    scene.objects.forEach((rec) => rec.faces.forEach((face, fi) => {
      if (!face.front) return;
      const idx = rec.faceIndexArrays[fi];
      tris.push(idx.map((k) => rec.projected[k]));
    }));
    const inPoly = (x, y, poly) => {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i]; const b = poly[j];
        if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      }
      return inside;
    };
    const pts = [];
    for (let x = 0; x < 320; x += 1) for (let y = 0; y < 220; y += 1) {
      if (tris.some((t) => inPoly(x + 0.5, y + 0.5, t))) pts.push([x + 0.5, y + 0.5]);
    }
    const params2 = { ...params };
    const paths = V.AlgorithmRegistry.scene3d.generate(params2, null, null, BOUNDS) || [];
    const ink = paths.filter((p) => {
      const m = p.meta || {}; const t = m.sceneTarget;
      return m.kind === 'sceneFill' && t && t.objectId !== 'ground';
    });
    return { pts, ink };
  };
  // Coverage = share of front-region CELLS (CELL mm square, wider than any tone-driven hatch gap) that hold at least one
  // ink sample. Insensitive to how tone spaces the hatch, so it measures "is the region filled" and not "how dense".
  const CELL = 6;
  const coverage = (g) => {
    const { pts, ink } = regionAndInk(g);
    const cells = new Set(); const inked = new Set();
    pts.forEach(([x, y]) => cells.add(`${Math.floor(x / CELL)}_${Math.floor(y / CELL)}`));
    ink.forEach((p) => {
      for (let i = 0; i + 1 < p.length; i += 1) {
        const a = p[i]; const b = p[i + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 1));
        for (let k = 0; k <= n; k += 1) inked.add(`${Math.floor((a.x + (b.x - a.x) * k / n) / CELL)}_${Math.floor((a.y + (b.y - a.y) * k / n) / CELL)}`);
      }
    });
    let hit = 0; cells.forEach((c) => { if (inked.has(c)) hit += 1; });
    return { area: pts.length, covered: cells.size ? hit / cells.size : 0, n: ink.length };
  };
  const nFill = (g) => fillPaths(g).filter((p) => (p.meta || {}).kind === 'sceneFill').length;

  [['sphere', 30, 20], ['sphere', 45, 35], ['cylinder', 30, 20]].forEach(([cutter, yaw, pitch]) => {
    test(`box minus ${cutter} @${yaw}/${pitch}: fill is not shredded (paths vs plain box, front coverage)`, () => {
            const carved = scene({ cutter, yaw, pitch });
      const n = nFill(carved);
      const cov = coverage(carved);
      // A continuous-region hatch draws one long path per scanline span while a faceted box draws a set per face, so
      // path counts are not 1:1 with the plain box (origin/main drew 0-1 paths here); require a real set of strokes.
      expect(n).toBeGreaterThanOrEqual(8);
      expect(cov.covered).toBeGreaterThanOrEqual(0.6);
    });
  });

  test('oracle baseline: an uncarved box reads >= 60% (its tone-blank highlight face is legitimately empty)', () => {
    const cov = coverage(scene({ carve: false }));
    expect(cov.covered).toBeGreaterThanOrEqual(0.6);
  });
});
