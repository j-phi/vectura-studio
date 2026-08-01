const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Scene3D.Shadows — cast shadows on the ground (Phase 2 stream 2A).
 *
 * - overlapping casters in one class → a single unioned region (no seam);
 * - caster-bound subtraction removes the shadow under the caster body;
 * - HLR clips the shadow beneath an occluding object;
 * - styled-over-unstyled precedence carves the unstyled overlap;
 * - grazing-light fuzz never throws (FillBoolean degrades to []);
 * - draft preview emits without polygon booleans.
 */

const clone = (value) => JSON.parse(JSON.stringify(value));
const BOUNDS = { width: 320, height: 220, penWidth: 0.3 };

const boxObj = (id, x, y, size = 30) => ({
  id, name: id, primitive: 'box', params: { sx: size, sy: size, sz: size },
  transform: { x, y, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
});

describe('Scene3D.Shadows (CONTRACT L2/L4)', () => {
  let runtime;
  let V;
  let Shadows;
  let HLR;
  let Lighting;
  let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    Shadows = V.Scene3D.Shadows;
    HLR = V.Scene3D.HLR;
    Lighting = V.Scene3D.Lighting;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });

  afterAll(() => runtime.cleanup());

  // Assemble scene + clipper + light and run Shadows.build. `occlude` false
  // hands an EMPTY occluder set (isolates boolean effects from HLR).
  const runShadows = (objects, light, opts = {}) => {
    const p = V.Scene3D.Params.normalizeParams({
      ...clone(defaults),
      objects,
      ground: { enabled: true },
      lights: [{ id: 'sun', type: 'directional', castShadows: true, ...light }],
      camera: { projection: 'orthographic', yaw: 0, pitch: 55, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
    });
    const scene = V.Scene3D.Scene.assembleScene(p, BOUNDS);
    const occ = [];
    if (opts.occlude !== false) {
      scene.objects.forEach((r) => r.faces.forEach((f) => {
        if (f.front) occ.push({ id: f.key, objectId: r.id, polygon: f.polygon, onlyOwnObject: r.visibility === 'xray' });
      }));
    }
    const clipper = HLR.createClipper(occ, { bias: 0.05 });
    const lightDir = Lighting.lightWorldDir(p.lights[0]);
    return Shadows.build(scene, p, { ...BOUNDS, ...(opts.bounds || {}) }, clipper, lightDir, opts.opts || {});
  };

  const shadowPaths = (paths) => paths.filter((p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.regionClass === 'castShadow');
  const regionCount = (paths) => new Set(shadowPaths(paths).map((p) => JSON.stringify(p.meta.sceneTarget.pickPolygon))).size;
  // Shrink a polygon toward its centroid so a "deep interior" containment test
  // ignores points sitting on a carved boundary (float-precision slivers).
  const inset = (poly, k = 0.8) => {
    let cx = 0; let cy = 0;
    poly.forEach((p) => { cx += p.x; cy += p.y; });
    cx /= poly.length; cy /= poly.length;
    return poly.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
  };

  test('emitted shadows carry CONTRACT L2 meta', () => {
    const paths = shadowPaths(runShadows([boxObj('obj-1', 0, 20)], { azimuth: 160, elevation: 45 }));
    expect(paths.length).toBeGreaterThan(0);
    paths.forEach((p) => {
      const t = p.meta.sceneTarget;
      expect(t.objectId).toBe('ground');
      expect(t.faceId).toBe('face:ground');
      expect(t.regionClass).toBe('castShadow');
      expect(Array.isArray(t.pickPolygon)).toBe(true);
      expect(t.pickPolygon.length).toBeGreaterThanOrEqual(3);
      expect(t.facingUp).toBe(true);
      expect(Number.isFinite(t.depth)).toBe(true);
    });
  });

  test('two overlapping casters in one class → single unioned region', () => {
    const light = { azimuth: 180, elevation: 40 };
    const overlap = runShadows([boxObj('obj-1', -12, 20), boxObj('obj-2', 12, 20)], light);
    const apart = runShadows([boxObj('obj-1', -90, 20), boxObj('obj-2', 90, 20)], light);
    expect(regionCount(overlap)).toBe(1);         // merged, no internal seam
    expect(regionCount(apart)).toBe(2);           // disjoint → two regions
    // merged region loses single-caster identity (CONTRACT L2 casterId null)
    shadowPaths(overlap).forEach((p) => expect(p.meta.sceneTarget.casterId).toBeNull());
  });

  test('caster-bound: no shadow hatch falls inside the caster silhouette', () => {
    // Empty occluder set isolates the boolean subtraction from HLR clipping.
    const p = V.Scene3D.Params.normalizeParams({
      ...clone(defaults), objects: [boxObj('obj-1', 0, 20)], ground: { enabled: true },
      lights: [{ id: 'sun', castShadows: true, azimuth: 160, elevation: 40 }],
      camera: { projection: 'orthographic', yaw: 0, pitch: 55, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
    });
    const scene = V.Scene3D.Scene.assembleScene(p, BOUNDS);
    const clipper = HLR.createClipper([], { bias: 0.05 }); // no HLR occlusion
    const lightDir = Lighting.lightWorldDir(p.lights[0]);
    const paths = shadowPaths(Shadows.build(scene, p, BOUNDS, clipper, lightDir, {}));
    expect(paths.length).toBeGreaterThan(0);
    const silhouettes = scene.objects[0].faces.filter((f) => f.front)
      .map((f) => inset(f.polygon.map((p) => ({ x: p.x, y: p.y }))));
    paths.forEach((path) => path.forEach((pt) => {
      silhouettes.forEach((poly) => expect(HLR.pointInPolygon(pt, poly)).toBe(false));
    }));
  });

  test('HLR occlusion: an object standing on a shadow drops the runs beneath it', () => {
    // obj-1 casts; obj-2 is a tall box parked over obj-1's shadow footprint.
    const light = { azimuth: 180, elevation: 35 };
    const objects = [boxObj('obj-1', 0, 20, 30), boxObj('obj-2', 0, 25, 40)];
    objects[1].transform.z = 55; // in front, over the cast direction
    const p = V.Scene3D.Params.normalizeParams({
      ...clone(defaults), objects, ground: { enabled: true },
      lights: [{ id: 'sun', castShadows: true, ...light }],
      camera: { projection: 'orthographic', yaw: 0, pitch: 55, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
    });
    const scene = V.Scene3D.Scene.assembleScene(p, BOUNDS);
    const occ = [];
    scene.objects.forEach((r) => r.faces.forEach((f) => { if (f.front) occ.push({ id: f.key, objectId: r.id, polygon: f.polygon }); }));
    const withHLR = HLR.createClipper(occ, { bias: 0.05 });
    const noHLR = HLR.createClipper([], { bias: 0.05 });
    const lightDir = Lighting.lightWorldDir(p.lights[0]);
    const clipped = shadowPaths(Shadows.build(scene, p, BOUNDS, withHLR, lightDir, {}));
    const unclipped = shadowPaths(Shadows.build(scene, p, BOUNDS, noHLR, lightDir, {}));
    // HLR removes at least some run length that the no-occluder pass kept.
    const totalLen = (paths) => paths.reduce((acc, path) => {
      let l = 0; for (let i = 1; i < path.length; i++) l += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y); return acc + l;
    }, 0);
    expect(totalLen(clipped)).toBeLessThan(totalLen(unclipped));
  });

  test('a caster straddling the receiver casts a SINGLE-SIDED footprint (no mirrored bow-tie)', () => {
    // Box CENTERED on the origin ⇒ its lower half is buried below the y=0 ground.
    // Un-clipped, the below-ground vertices project with a flipped sign (t=P.y/d.y
    // crosses the singularity) and mirror the footprint to the light side — a
    // bow-tie. The y≥0 half-space clip must keep the shadow on ONE side.
    const p = V.Scene3D.Params.normalizeParams({
      ...clone(defaults), objects: [boxObj('obj-1', 0, 0, 40)], ground: { enabled: true },
      lights: [{ id: 'sun', castShadows: true, azimuth: 160, elevation: 30 }],
      camera: { projection: 'orthographic', yaw: 0, pitch: 55, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
    });
    const scene = V.Scene3D.Scene.assembleScene(p, BOUNDS);
    const clipper = HLR.createClipper([], { bias: 0.05 });
    const lightDir = Lighting.lightWorldDir(p.lights[0]);
    const paths = shadowPaths(Shadows.build(scene, p, BOUNDS, clipper, lightDir, {}));
    expect(paths.length).toBeGreaterThan(0);
    // Caster screen-centre (front-face silhouette centroid).
    let cx = 0; let cy = 0; let n = 0;
    scene.objects[0].faces.forEach((f) => { if (f.front) f.polygon.forEach((pt) => { cx += pt.x; cy += pt.y; n += 1; }); });
    cx /= n; cy /= n;
    // Mean offset direction of the footprint from the caster centre.
    let mx = 0; let my = 0;
    paths.forEach((path) => path.forEach((pt) => { mx += pt.x - cx; my += pt.y - cy; }));
    const L = Math.hypot(mx, my) || 1; const dx = mx / L; const dy = my / L;
    // Signed reach along that direction: far (smax) vs near-side overhang (smin).
    let smin = Infinity; let smax = -Infinity;
    paths.forEach((path) => path.forEach((pt) => {
      const s = (pt.x - cx) * dx + (pt.y - cy) * dy;
      if (s < smin) smin = s; if (s > smax) smax = s;
    }));
    expect(smax).toBeGreaterThan(10);          // the shadow genuinely extends one way
    expect(smin).toBeGreaterThan(-smax * 0.5); // …and barely overhangs the opposite (light) side
  });

  test('styled-over-unstyled precedence: the unstyled overlap is carved out', () => {
    const light = { azimuth: 180, elevation: 40 };
    const styleOf = (objectId) => (objectId === 'obj-2' ? { penId: 'pen-9' } : { penId: null });
    const paths = shadowPaths(runShadows(
      [boxObj('obj-1', -12, 20), boxObj('obj-2', 12, 20)], light, { opts: { styleOf } }));
    const styled = paths.filter((p) => p.meta.penId === 'pen-9');
    const unstyled = paths.filter((p) => !p.meta.penId);
    expect(styled.length).toBeGreaterThan(0);
    expect(unstyled.length).toBeGreaterThan(0);
    // No unstyled point lands inside the styled region (styled subtracted it).
    const styledPolys = [...new Set(styled.map((p) => JSON.stringify(p.meta.sceneTarget.pickPolygon)))]
      .map((s) => inset(JSON.parse(s)));
    unstyled.forEach((path) => path.forEach((pt) => {
      styledPolys.forEach((poly) => expect(HLR.pointInPolygon(pt, poly)).toBe(false));
    }));
  });

  test('draft preview (fastPreview) emits shadows without booleans, per-caster casterId', () => {
    const paths = shadowPaths(runShadows(
      [boxObj('obj-1', -12, 20), boxObj('obj-2', 12, 20)], { azimuth: 180, elevation: 40 },
      { bounds: { fastPreview: true, preview3dQuality: 'draft' } }));
    expect(paths.length).toBeGreaterThan(0);
    // Draft keeps per-caster identity (no union) — every region names its caster.
    paths.forEach((p) => expect(['obj-1', 'obj-2']).toContain(p.meta.sceneTarget.casterId));
  });

  test('multi-light: each shadow-casting directional light drops its own footprint; ambient casts none', () => {
    const algo = V.AlgorithmRegistry.scene3d;
    const base = {
      ...clone(defaults), objects: [boxObj('obj-1', 0, 20, 40)], ground: { enabled: true },
      camera: { projection: 'orthographic', yaw: 0, pitch: 55, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
    };
    const shadowLen = (lights) => {
      const paths = algo.generate(V.Scene3D.Params.normalizeParams({ ...base, lights }), null, null, BOUNDS) || [];
      return paths.filter((p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.regionClass === 'castShadow')
        .reduce((n, p) => n + p.length, 0);
    };
    const sun = { id: 'sun', type: 'directional', azimuth: 160, elevation: 40, castShadows: true };
    const l2 = { id: 'l2', type: 'directional', azimuth: 20, elevation: 40, castShadows: true };
    const amb = { id: 'amb', type: 'ambient', intensity: 0.4 };
    const one = shadowLen([sun]);
    expect(one).toBeGreaterThan(0);
    // A second directional light adds a second footprint (more shadow run length).
    expect(shadowLen([sun, l2])).toBeGreaterThan(one);
    // Ambient casts NOTHING — the footprint is unchanged by adding it.
    expect(shadowLen([sun, amb])).toBe(one);
  });

  test('grazing light is skipped (no shadows below ~2°)', () => {
    expect(shadowPaths(runShadows([boxObj('obj-1', 0, 20)], { azimuth: 180, elevation: 0.5 })).length).toBe(0);
    expect(shadowPaths(runShadows([boxObj('obj-1', 0, 20)], { azimuth: 180, elevation: 45 })).length).toBeGreaterThan(0);
  });

  test('grazing-light fuzz: generate NEVER throws over an elevation×azimuth sweep', () => {
    const algo = V.AlgorithmRegistry.scene3d;
    // A self-overlapping caster (torusKnot) + a box, ground on, tone on.
    const base = {
      ...clone(defaults),
      objects: [
        { id: 'obj-1', name: 'Knot', primitive: 'torusKnot', params: { sx: 30, sy: 12, sz: 12, detail: 10 }, transform: { x: 0, y: 30, z: 0, yaw: 20, pitch: 10, roll: 0, scale: 1 }, visibility: 'solid' },
        boxObj('obj-2', 40, 20, 30),
      ],
      ground: { enabled: true },
      camera: { projection: 'orthographic', yaw: -20, pitch: 30, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
    };
    let ran = 0;
    let nonEmpty = 0;
    for (let el = 0.1; el <= 89; el += 12.5) {
      for (let az = 0; az < 360; az += 45) {
        const p = clone(base);
        p.lights = [{ id: 'sun', type: 'directional', azimuth: az, elevation: el, castShadows: true }];
        let paths;
        expect(() => { paths = algo.generate(p, null, null, BOUNDS); }).not.toThrow();
        ran += 1;
        if (paths && paths.length) nonEmpty += 1;
      }
    }
    expect(ran).toBeGreaterThan(40);
    expect(nonEmpty).toBeGreaterThan(0);
  });
});
