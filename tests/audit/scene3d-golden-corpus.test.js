const crypto = require('crypto');
const { loadScene3dAuditRuntime } = require('../helpers/scene3d-audit-runtime');
const { goldenValues } = require('../helpers/golden-values');

/*
 * Scene3D golden corpus (judgment R-40): a broad drift canary over canonical scenes.
 *
 * It is a COMPLEMENT to the mechanism tests, not a replacement. A mechanism test says WHY a
 * drawing is right; this file only says the drawing did not change. Each scene is small (low
 * detail, low density) but still reaches its mechanism: primitives x fill styles, tone on/off,
 * wireframe with hidden edges, depth slice, x-ray, inter-object HLR, cast shadow on the ground
 * and on other objects, boolean groups, perspective, and an imported mesh.
 *
 * The summary per scene is fine-grained so a LOCAL defect fails too: one hash per output path
 * (its points rounded to 1/1000 mm, plus its kind, pen, dash, edge class and closed flag), and
 * path count, ink length and bounding box. A diff of the golden file names the paths that moved.
 *
 * Values live in tests/baselines/golden-values/scene3d-golden-corpus.json, per architecture.
 * Regenerate only on purpose: `npm run test:update -- tests/audit/scene3d-golden-corpus.test.js`
 * and `scripts/test-update-goldens-x64.sh tests/audit/scene3d-golden-corpus.test.js`.
 */

const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };
const clone = (v) => JSON.parse(JSON.stringify(v));
const r3 = (n) => Math.round(Number(n) * 1000) / 1000;
const hash = (v) => crypto.createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex').slice(0, 12);

const T = (x = 0, y = 0, z = 0, extra = {}) => ({ x, y, z, yaw: 0, pitch: 0, roll: 0, scale: 1, ...extra });
const obj = (id, primitive, params, transform = T(), extra = {}) => ({
  id, name: id, primitive, params, transform, visibility: 'solid', ...extra,
});

// Small, representative parameter bags per primitive.
const PRIM = {
  box: { sx: 36, sy: 36, sz: 36 },
  plane: { sx: 60, sz: 60 },
  sphere: { radius: 22, detail: 10 },
  ellipsoid: { sx: 50, sy: 30, sz: 36, detail: 10 },
  cylinder: { sx: 18, sy: 22, sz: 18, detail: 12 },
  cone: { sx: 20, sy: 22, sz: 20, detail: 12 },
  torus: { sx: 60, sy: 16, sz: 16, detail: 14 },
  capsule: { sx: 14, sy: 18, sz: 14, detail: 10 },
  superellipsoid: { sx: 40, sy: 40, sz: 40, detail: 10 },
  pyramid: { sx: 30, sy: 32, sz: 30, detail: 8 },
  solid: { solidType: 'buckyball', radius: 26 },
};

// A small imported mesh: an uneven octahedron, faces wound outward (checked below).
const MESH = (() => {
  const vertices = [
    { x: 1, y: 0, z: 0 }, { x: -0.8, y: 0, z: 0 }, { x: 0, y: 1.2, z: 0 },
    { x: 0, y: -0.6, z: 0 }, { x: 0, y: 0, z: 0.9 }, { x: 0, y: 0, z: -1 },
  ];
  const faces = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]];
  return { vertices, faces };
})();

const sun = (extra = {}) => ({ id: 'sun', type: 'directional', azimuth: 200, elevation: 55, castShadows: false, ...extra });
const style = (mapper, params = {}) => ({ penId: null, mapper, params: { fillAngle: 45, fillDensity: 35, ...params } });

// Every scene is a function of the scene3d defaults; `edit` is the last word.
const SCENES = {
  // Primitives x fill styles (tone on, one sun, no ground).
  'box/hatch': { objects: [obj('o1', 'box', PRIM.box)], style: style('hatch') },
  'box/crosshatch': { objects: [obj('o1', 'box', PRIM.box)], style: style('crosshatch') },
  'box/contour': { objects: [obj('o1', 'box', PRIM.box)], style: style('contour') },
  'box/spiral': { objects: [obj('o1', 'box', PRIM.box)], style: style('spiral') },
  'box/stipple': { objects: [obj('o1', 'box', PRIM.box)], style: style('stipple', { fillDensity: 20 }) },
  'sphere/hatch': { objects: [obj('o1', 'sphere', PRIM.sphere)], style: style('hatch') },
  'sphere/crosshatch': { objects: [obj('o1', 'sphere', PRIM.sphere)], style: style('crosshatch') },
  'sphere/contour': { objects: [obj('o1', 'sphere', PRIM.sphere)], style: style('contour') },
  'sphere/spiral': { objects: [obj('o1', 'sphere', PRIM.sphere)], style: style('spiral') },
  'sphere/stipple': { objects: [obj('o1', 'sphere', PRIM.sphere)], style: style('stipple', { fillDensity: 20 }) },
  'sphere/hatch-tapered-ribbon': { objects: [obj('o1', 'sphere', PRIM.sphere)], style: style('hatch', { toneLaw: 'taperedEnds' }) },
  'plane/hatch': { objects: [obj('o1', 'plane', PRIM.plane)], style: style('hatch') },
  'ellipsoid/crosshatch': { objects: [obj('o1', 'ellipsoid', PRIM.ellipsoid)], style: style('crosshatch') },
  'cylinder/hatch': { objects: [obj('o1', 'cylinder', PRIM.cylinder)], style: style('hatch') },
  'cone/contour': { objects: [obj('o1', 'cone', PRIM.cone)], style: style('contour') },
  'torus/hatch': { objects: [obj('o1', 'torus', PRIM.torus)], style: style('hatch') },
  'capsule/stipple': { objects: [obj('o1', 'capsule', PRIM.capsule)], style: style('stipple', { fillDensity: 20 }) },
  'superellipsoid/spiral': { objects: [obj('o1', 'superellipsoid', PRIM.superellipsoid)], style: style('spiral') },
  'pyramid/hatch': { objects: [obj('o1', 'pyramid', PRIM.pyramid)], style: style('hatch') },
  'buckyball/hatch': { objects: [obj('o1', 'solid', PRIM.solid)], style: style('hatch') },
  'mesh/hatch': { objects: [obj('o1', 'solid', { solidType: 'importedMesh', radius: 30, importedMesh: MESH })], style: style('hatch') },
  'mesh/wireframe': { objects: [obj('o1', 'solid', { solidType: 'importedMesh', radius: 30, importedMesh: MESH })], style: style('wireframe') },
  'sphere/tone-off-hatch': { objects: [obj('o1', 'sphere', PRIM.sphere)], style: style('hatch'), tone: false },

  // Wireframe and hidden edges.
  'box/wireframe': { objects: [obj('o1', 'box', PRIM.box)], style: style('wireframe') },
  'box/wireframe-show-hidden': { objects: [obj('o1', 'box', PRIM.box)], style: style('wireframe', { showHidden: true }) },
  'box/wireframe-silhouette-only': {
    objects: [obj('o1', 'box', PRIM.box)],
    style: style('wireframe', { edgeClasses: { silhouette: true, boundary: false, crease: false, interior: false } }),
  },

  // Depth slice.
  'sphere/slice': { objects: [obj('o1', 'sphere', PRIM.sphere)], style: style('contourSlice', { sliceCount: 10 }) },
  'torus/slice-full-contour': {
    objects: [obj('o1', 'torus', PRIM.torus)],
    style: style('contourSlice', { sliceCount: 8, sliceTilt: 30, sliceVisibility: 'fullContour' }),
  },

  // Occlusion and x-ray.
  'two-spheres/hatch-hlr': {
    objects: [obj('o1', 'sphere', PRIM.sphere, T(-12, 0, 0)), obj('o2', 'sphere', PRIM.sphere, T(14, 0, -40))],
    style: style('hatch'),
  },
  'box/xray-hatch': { objects: [obj('o1', 'box', PRIM.box, T(), { visibility: 'xray' })], style: style('hatch') },
  'box-minus-sphere/subtract': {
    objects: [obj('o1', 'box', PRIM.box), obj('o2', 'sphere', { radius: 20, detail: 10 }, T(14, 14, 14))],
    groups: [{ id: 'g1', op: 'subtract', children: ['o1', 'o2'] }],
    style: style('wireframe'),
  },

  // Light, ground and shadows.
  'box/cast-shadow-ground': {
    objects: [obj('o1', 'box', PRIM.box, T(0, 18, 0))], ground: true, light: { castShadows: true }, style: style('hatch'),
  },
  'two-boxes/shadow-on-objects': {
    objects: [obj('o1', 'box', { sx: 20, sy: 50, sz: 20 }, T(-24, 25, 0)), obj('o2', 'box', PRIM.box, T(22, 18, 10))],
    ground: true, light: { castShadows: true, azimuth: 250, elevation: 40 }, style: style('hatch'),
    shadow: { shadowReceiveOnObjects: true },
  },
  'sphere/layered-shadow': {
    objects: [obj('o1', 'sphere', PRIM.sphere, T(0, 22, 0))], ground: true, light: { castShadows: true },
    style: style('hatch'), shadow: { shadowLayers: true, shadowLayerCount: 3 },
  },

  // Camera.
  'box/perspective-hatch': {
    objects: [obj('o1', 'box', PRIM.box, T(0, 0, 0, { yaw: 20 }))], style: style('hatch'),
    camera: { projection: 'perspective', cameraDistance: 300, focalLength: 300 },
  },
};

// The scene params for one corpus entry (a plain function of the defaults).
const buildParams = (defaults, scene) => {
  const p = clone(defaults);
  p.seed = 7;
  p.objects = clone(scene.objects);
  p.groups = clone(scene.groups || []);
  p.ground = { enabled: !!scene.ground };
  p.backdrop = { enabled: false };
  p.camera = { projection: 'orthographic', yaw: -25, pitch: 20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1, ...(scene.camera || {}) };
  // The style goes on each object; the scene scope stays the default (wireframe), so the ground
  // stays a quiet outline and a cast shadow reads as its own fill.
  const byObject = {};
  scene.objects.forEach((o) => { byObject[o.id] = clone(scene.style); });
  p.styleTable = { scene: clone(defaults.styleTable.scene), byObject, byFace: {} };
  p.tone = { ...clone(defaults.tone), enabled: scene.tone !== false };
  p.lights = [sun(scene.light)];
  p.shadow = { ...clone(defaults.shadow), ...(scene.shadow || {}) };
  return p;
};

const pathPoints = (pth) => (pth.points || pth);
// Every meta field takes part (kind, object, face, edge class, occluded, hidden dash, pen,
// ribbon data, ...), numbers rounded like the points.
const roundDeep = (v) => {
  if (typeof v === 'number') return r3(v);
  if (Array.isArray(v)) return v.map(roundDeep);
  if (v && typeof v === 'object') {
    const out = {};
    Object.keys(v).sort().forEach((k) => { out[k] = roundDeep(v[k]); });
    return out;
  }
  return v;
};
const pathSummary = (pth) => ({ pts: pathPoints(pth).map((q) => [r3(q.x), r3(q.y)]), meta: roundDeep(pth.meta || {}) });
const kindOf = ({ meta }) => {
  const target = meta.sceneTarget || {};
  return [meta.kind || '?', target.edgeClass, meta.hiddenLine ? 'hidden' : null].filter(Boolean).join('/');
};

// The golden summary of one render: per-path hashes in output order, plus aggregates.
const summarize = (out) => {
  const rows = out.map(pathSummary);
  let ink = 0;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  let points = 0;
  rows.forEach(({ pts }) => {
    points += pts.length;
    pts.forEach(([x, y], i) => {
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      if (i) ink += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
    });
  });
  const kinds = {};
  rows.forEach((row) => { const k = kindOf(row); kinds[k] = (kinds[k] || 0) + 1; });
  return {
    n: rows.length,
    points,
    ink: Math.round(ink * 10) / 10,
    bbox: rows.length ? [minX, minY, maxX, maxY] : null,
    kinds,
    paths: rows.map(hash),
  };
};

describe('Scene3D golden corpus (R-40)', () => {
  vi.setConfig({ testTimeout: 600000 });
  const golden = goldenValues('scene3d-golden-corpus');
  const h = { runtime: null, V: null };

  beforeAll(async () => {
    h.runtime = await loadScene3dAuditRuntime();
    h.V = h.runtime.window.Vectura;
  }, 120000);
  afterAll(() => h.runtime && h.runtime.cleanup());

  test('the imported mesh fixture is wound outward', () => {
    const { vertices, faces } = MESH;
    faces.forEach((f) => {
      const [a, b, c] = f.map((i) => vertices[i]);
      const u = [b.x - a.x, b.y - a.y, b.z - a.z];
      const w = [c.x - a.x, c.y - a.y, c.z - a.z];
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const centroid = [(a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3];
      expect(n[0] * centroid[0] + n[1] * centroid[1] + n[2] * centroid[2], `face ${f}`).toBeGreaterThan(0);
    });
  });

  test.each(Object.keys(SCENES))('%s draws its golden summary', (name) => {
    const { V } = h;
    const out = V.AlgorithmRegistry.scene3d.generate(buildParams(V.ALGO_DEFAULTS.scene3d, SCENES[name]), null, null, BOUNDS) || [];
    const summary = summarize(out);
    // Every scene must draw something; an empty golden would pin nothing.
    expect(summary.n, name).toBeGreaterThan(0);
    golden.expect(name, summary);
  });
});
