/* W-32 Rank 4 spike gate — byte-identity roster.
 * md5 of the emitted geometry at 9 dp, prototype ON vs OFF, per kind.
 */
const path = require('path'); const crypto = require('crypto');
const ROOT = process.env.ROOT || '/private/tmp/claude-501/scratch-W32r4';
const { loadVecturaRuntime } = require(path.join(ROOT, 'tests', 'helpers', 'load-vectura-runtime'));
const MAPPERS = ['none', 'hatch', 'wireframe', 'crosshatch', 'contour', 'spiral', 'stipple', 'contourSlice'];
const PRIMS = (process.env.PRIMS || 'sphere,ellipsoid,capsule,cone,cylinder,torus,torusKnot,superellipsoid,pyramid,box,plane,solid').split(',');
(async () => {
  const rt = await loadVecturaRuntime(); const V = rt.window.Vectura; const P = V.Scene3D.Params;
  const CAM = { ...P.DEFAULT_CAMERA };
  const build = (primitive, mapper, ground) => {
    const eng = new V.VectorEngine(); eng.currentProfile = { width: 320, height: 220, name: 'id' };
    const gid = eng.addLayer('scene3d');
    eng.layers = eng.layers.filter((l) => l.parentId !== gid);
    const g = eng.layers.find((l) => l.id === gid); g.isGroup = true; g.containerRole = 'scene';
    const q = g.params; q.camera = CAM; q.ground = { enabled: !!ground }; q.backdrop = { enabled: false };
    const bag = { ...(P.PRIMITIVE_PARAM_DEFAULTS[primitive] || {}), ...(P.PRIMITIVE_CREATE_DEFAULTS[primitive] || {}) };
    q.objects = [{ id: 'obj', name: 'Obj', primitive, params: bag, transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' }];
    q.lights = [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false }];
    const st = { penId: null, mapper, params: { fillAngle: 45, fillDensity: 50, toneLaw: (V.SCENE_FILL_STYLES && V.SCENE_FILL_STYLES.DEFAULT) || 'ladder' } };
    q.styleTable = { scene: JSON.parse(JSON.stringify(st)), byObject: { obj: JSON.parse(JSON.stringify(st)) }, byFace: {} };
    eng.computeAllDisplayGeometry();
    return (eng.getLayerById(gid).scenePaths) || [];
  };
  const digest = (paths, kind) => {
    const h = crypto.createHash('md5');
    paths.forEach((p) => {
      if (kind && (!p.meta || p.meta.kind !== kind)) return;
      h.update((p.meta && p.meta.kind) || '?'); h.update('|');
      (p.points || p).forEach((pt) => h.update(pt.x.toFixed(9) + ',' + pt.y.toFixed(9) + ';'));
      h.update('\n');
    });
    return h.digest('hex').slice(0, 12);
  };
  const out = [];
  for (const primitive of PRIMS) {
    for (const mapper of MAPPERS) {
      rt.window.__SIL_PROTO_OFF = true; const off = build(primitive, mapper, false);
      rt.window.__SIL_PROTO_OFF = false; const on = build(primitive, mapper, false);
      out.push({
        primitive, mapper,
        all: digest(off) === digest(on) ? 'IDENTICAL' : 'CHANGED',
        fill: digest(off, 'sceneFill') === digest(on, 'sceneFill') ? 'IDENTICAL' : 'CHANGED',
        edge: digest(off, 'sceneEdge') === digest(on, 'sceneEdge') ? 'IDENTICAL' : 'CHANGED',
        paths: off.length === on.length ? off.length : (off.length + '->' + on.length),
      });
    }
  }
  // ground plane, one cell
  rt.window.__SIL_PROTO_OFF = true; const goff = build('sphere', 'hatch', true);
  rt.window.__SIL_PROTO_OFF = false; const gon = build('sphere', 'hatch', true);
  out.push({ primitive: 'sphere+GROUND', mapper: 'hatch', all: digest(goff) === digest(gon) ? 'IDENTICAL' : 'CHANGED',
    fill: digest(goff, 'sceneFill') === digest(gon, 'sceneFill') ? 'IDENTICAL' : 'CHANGED',
    edge: digest(goff, 'sceneEdge') === digest(gon, 'sceneEdge') ? 'IDENTICAL' : 'CHANGED',
    paths: goff.length === gon.length ? goff.length : (goff.length + '->' + gon.length) });
  console.log(JSON.stringify(out, null, 1));
  rt.cleanup();
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
