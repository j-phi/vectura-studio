/*
 * RGR — mono fill perf on the 3D Scene (mezzoRegion drag cost).
 *
 *  1. LAZY FIELDS. `attachFields`' 133x133 depth/radiance raster (~17.7k `inv`
 *     calls, ~36 % of `emit`) is built only when a law reads it (etfKang's
 *     `gradZ`, creviceAO's `aoAt`, contactBloom's `horizonAt`/`lightDir`).
 *  2. DRAFT SUBSTRATE. Under the 'law' drag tier (`bounds.lawDraft`) the mono
 *     chart lattice and fallback seeds are coarser, and faceted faces (box,
 *     plane) honour MONO_DRAFT_PEN_SCALE like the curved path does.
 *  3. FULL TIER IDENTITY. The settled compose is byte-identical: the hashes in
 *     tests/baselines/golden-values/scene3d-mono-draft-substrate.json were
 *     recorded from the pristine pre-change tree (origin/main 4967344), not
 *     from this change's output.
 *
 * RED (original src): fieldBuilds is undefined (no counter / always built),
 * draft lattice size equals full, faceted draft passes the raw pen width and
 * no substrateDraft. The golden identity tests pass on both sides by design.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { goldenValues } = require('../helpers/golden-values');

const hashPaths = (paths) => {
  let h = 0x811c9dc5 >>> 0; let n = 0; let pts = 0;
  const mix = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
  (paths || []).forEach((p) => {
    if (!Array.isArray(p)) return;
    n++; mix('|');
    p.forEach((q) => { pts++; mix(`${q.x},${q.y};`); });
  });
  return { hash: h.toString(16), paths: n, pts };
};

const golden = goldenValues('scene3d-mono-draft-substrate');
const SCENES = [
  { prim: 'sphere', law: 'mezzoRegion' },
  { prim: 'box', law: 'mezzoRegion' },
  { prim: 'plane', law: 'mezzoRegion' },
  { prim: 'sphere', law: 'etfKang' }, // the one roster law that reads the fields (gradZ)
];

describe('mono fill — lazy fields, draft substrate, full-tier identity', () => {
  let runtime; let V;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: false });
    V = runtime.window.Vectura;
    // These tests pin the DRAFT TIERS of the generator; a pose-only preview would be served by the
    // pose warp instead (covered by scene3d-pose-preview.test.js).
    V.SETTINGS.scenePoseWarp = false;
  }, 300000);
  afterAll(() => runtime && runtime.cleanup && runtime.cleanup());
  afterEach(() => { delete V.SETTINGS.sceneDraftTier; });

  const makeScene = (prim, law) => {
    const engine = new V.VectorEngine();
    const gid = engine.addLayer('scene3d');
    const group = engine.layers.find((l) => l.id === gid);
    const child = engine.getLayerDescendants(gid).find((l) => l && l.type === 'object3d');
    child.params.primitive = prim;
    child.params.style = { penId: null, mapper: 'hatch', params: { fillCurves: true, toneLaw: law } };
    child.params.transform.yaw = 33;
    child.params.transform.pitch = 0;
    child.params.transform.roll = 0;
    return { engine, gid, group };
  };
  const full = (prim, law) => {
    const s = makeScene(prim, law);
    s.engine.computeAllDisplayGeometry();
    return { ...s, diag: runtime.window.__MONO_DIAG };
  };
  const draft = (prim, law, beforeDraft) => {
    const s = makeScene(prim, law);
    s.engine.computeAllDisplayGeometry();
    s.group._sceneLastFullMs = 5000; // a slow settled compose => 'law' tier
    runtime.window.__MONO_DIAG = null;
    if (beforeDraft) beforeDraft();
    s.engine.generate(s.gid, { preview: true });
    expect(s.group._pathsFromDraft).toBe(true);
    return { ...s, diag: runtime.window.__MONO_DIAG };
  };

  test.each(SCENES)('full tier $prim / $law is byte-identical to the pre-change tree', (g) => {
    const { group } = full(g.prim, g.law);
    const got = hashPaths(group.scenePaths);
    golden.expect(`${g.prim}/${g.law}`, { hash: got.hash, paths: got.paths, pts: got.pts });
  }, 180000);

  test('a law that never reads the fields never builds the raster', () => {
    expect(full('sphere', 'mezzoRegion').diag.fieldBuilds).toBe(0);
  }, 120000);

  test('a law that reads the fields (etfKang) builds the raster exactly once', () => {
    expect(full('sphere', 'etfKang').diag.fieldBuilds).toBe(1);
  }, 120000);

  // creviceAO / contactBloom (aoAt, horizonAt, lightDir) are not in the
  // SCENE3D_TONE_LAWS roster, so no scene reaches them; the accessors are
  // pinned directly on the traced context instead (every accessor, every 7th
  // lattice point, plus the light direction).
  test.each(['sphere', 'torus', 'box'])('field accessors on %s return the pre-change values', (prim) => {
    runtime.window.__MONO_TRACE = true;
    try {
      runtime.window.__MONO_CTX = null;
      full(prim, 'etfKang');
      const C = runtime.window.__MONO_CTX;
      expect(C).toBeTruthy();
      let h = 0x811c9dc5 >>> 0;
      const mix = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
      mix(JSON.stringify(C.lightDir));
      for (let k = 0; k < C.lat.length; k += 7) {
        const q = C.lat[k];
        mix(`${C.depthAt(q.x, q.y)},${C.aoAt(q.x, q.y)},${C.horizonAt(q.x, q.y)},${JSON.stringify(C.gradZ(q.x, q.y))};`);
      }
      golden.expect(`fields/${prim}`, { hash: h.toString(16), lat: C.lat.length });
    } finally { delete runtime.window.__MONO_TRACE; delete runtime.window.__MONO_CTX; }
  }, 120000);

  test('under lawDraft the chart lattice is much coarser; the full tier keeps the full lattice', () => {
    const f = full('sphere', 'mezzoRegion').diag;
    const d = draft('sphere', 'mezzoRegion').diag;
    expect(f.lat).toBeGreaterThan(9000);
    expect(d.lat).toBeLessThan(f.lat * 0.5);
    expect(d.emitted).toBeGreaterThan(0);
  }, 120000);

  test.each(['box', 'plane'])('faceted %s honours the draft pen scale and substrate, and only then', (prim) => {
    const M = V.Scene3D.SurfaceFillMono;
    const real = M.emit;
    const calls = [];
    M.emit = (o) => { calls.push({ pen: o.penWidth, ink: o.inkWidth, sd: o.substrateDraft, floor: o.floorPitch }); return real.call(M, o); };
    let fullCalls; let draftCalls;
    try {
      full(prim, 'mezzoRegion'); fullCalls = calls.splice(0);
      draft(prim, 'mezzoRegion', () => { calls.length = 0; }); draftCalls = calls.splice(0);
    } finally { M.emit = real; }
    expect(fullCalls.length).toBeGreaterThan(0);
    expect(draftCalls.length).toBeGreaterThan(0);
    expect(fullCalls.every((c) => c.sd == null)).toBe(true);
    expect(draftCalls.every((c) => c.sd && c.sd.lgScale < 1)).toBe(true);
    const base = fullCalls[0].pen;
    expect(draftCalls[0].pen / base).toBeCloseTo(2.5, 6);
    expect(draftCalls[0].ink / fullCalls[0].ink).toBeCloseTo(2.5, 6);
    expect(draftCalls[0].floor / fullCalls[0].floor).toBeCloseTo(2.5, 6);
  }, 180000);
});
