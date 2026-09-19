const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const S = '/private/tmp/claude-501/scratch-T2-7-plan';
const ROOTS = { main: S + '/main', t25: S + '/t25', proto: S + '/proto', proto2: S + '/proto2', proto3: S + '/proto3', proto4: S + '/proto4', p4a: S + '/p4a', p4b: S + '/p4b', p4c: S + '/p4c', p4d: S + '/p4d', p4e: S + '/p4e', p4f: S + '/p4f', p4g: S + '/p4g', p4h: S + '/p4h', p4i: S + '/p4i', p5a: S + '/p5a', p5b: S + '/p5b', v1: S + '/v1', v2: S + '/v2', v3: S + '/v3', v4: S + '/v4', v5: S + '/v5', v6: S + '/v6', v7: S + '/v7', v8: S + '/v8', v9: S + '/v9', v10: S + '/v10', v11: S + '/v11', v12: S + '/v12', v13: S + '/v13', v14: S + '/v14', v15: S + '/v15', v16: S + '/v16', p6a: S + '/p6a', p6b: S + '/p6b', p6c: S + '/p6c', p6d: S + '/p6d', p6e: S + '/p6e', q1: S + '/q1', q2: S + '/q2', q3: S + '/q3', p6f: S + '/p6f', p6g: S + '/p6g', r1: S + '/r1', r2: S + '/r2', r3: S + '/r3', r4: S + '/r4', p6h: S + '/p6h', p6i: S + '/p6i', p6j: S + '/p6j', p6k: S + '/p6k' };
const BOUNDS = { width: 1200, height: 1000, m: 20, dW: 1160, dH: 960, penWidth: 0.3 };
const SUN = { id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false };
const clone = (v) => JSON.parse(JSON.stringify(v));
async function makeRuntime(tag, overrides = {}) {
  const root = ROOTS[tag] || tag;
  const { loadVecturaRuntime } = require(root + '/tests/helpers/load-vectura-runtime');
  const rt = await loadVecturaRuntime({ rootDir: root, scriptOverrides: overrides });
  rt.window.Vectura.__win = rt.window;
  return rt.window.Vectura;
}
function buildParams(V, { primitive, mapper = 'hatch', rig = 'create', density = 50, toneLaw = 'mkTick' }) {
  const Params = V.Scene3D.Params; const defaults = V.ALGO_DEFAULTS.scene3d; const p = clone(defaults);
  const bag = rig === 'create' ? { ...clone(Params.PRIMITIVE_PARAM_DEFAULTS[primitive] || {}), ...clone(Params.PRIMITIVE_CREATE_DEFAULTS[primitive] || {}) } : clone(Params.PRIMITIVE_PARAM_DEFAULTS[primitive] || {});
  p.objects = [{ id: 'obj', name: 'Obj', primitive, params: bag, transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' }];
  p.ground = { enabled: false }; p.backdrop = { enabled: false }; p.camera = clone(Params.DEFAULT_CAMERA);
  p.tone = { ...clone(defaults).tone, enabled: true }; p.lights = [SUN];
  p.styleTable = { scene: { penId: null, mapper, params: { fillAngle: 45, fillDensity: density, toneLaw } }, byObject: {}, byFace: {} };
  return p;
}
function render(V, cfg) {
  const paths = V.AlgorithmRegistry.scene3d.generate(buildParams(V, cfg), null, null, BOUNDS);
  return { paths, stat: V.Scene3D.SurfaceFill.lastMarkStats };
}
const pts = (p) => { const o = []; for (let i = 0; i < p.length; i++) o.push({ x: p[i].x, y: p[i].y }); return o; };
const plen = (q) => { let t = 0; for (let i = 1; i < q.length; i++) t += Math.hypot(q[i].x - q[i-1].x, q[i].y - q[i-1].y); return t; };
const md5 = (paths) => crypto.createHash('md5').update(paths.map((p) => pts(p).map((q) => `${q.x.toFixed(4)},${q.y.toFixed(4)}`).join(';')).join('|')).digest('hex');
module.exports = { S, ROOTS, BOUNDS, makeRuntime, render, buildParams, pts, plen, md5 };
