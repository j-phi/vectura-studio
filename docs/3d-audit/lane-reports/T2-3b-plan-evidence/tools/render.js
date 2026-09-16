/* T2-3b planner — render mkTick cells from a given tree root, dump vector paths (mm) + mark stats. */
const fs = require('fs');
const path = require('path');

const args = {};
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[++i];
}
const ROOT = path.resolve(args.root);
const OUT = path.resolve(args.out);
const CELLS = (args.cells || 'sphere/contour,cone/contour,sphere/hatch,torus/hatch,torus/contour,cone/hatch').split(',').map((s) => s.split('/'));
const RIGS = (args.rigs || 'test,create').split(',');
const DENSITY = Number(args.density || 50);
const LAW = args.law || 'mkTick';
const { loadVecturaRuntime } = require(path.join(ROOT, 'tests/helpers/load-vectura-runtime.js'));

const REL_PATH = 'src/core/scene3d/surface-fill.js';
const BOUNDS = { width: 1200, height: 1000, m: 20, dW: 1160, dH: 960, penWidth: 0.3 };
const SUN = { id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false };
const clone = (v) => JSON.parse(JSON.stringify(v));

const buildSceneParams = (Params, defaults, { mapper, fillDensity, primitive, rig }) => {
  const p = clone(defaults);
  const bag = rig === 'create'
    ? { ...clone(Params.PRIMITIVE_PARAM_DEFAULTS[primitive] || {}), ...clone(Params.PRIMITIVE_CREATE_DEFAULTS[primitive] || {}) }
    : clone(Params.PRIMITIVE_PARAM_DEFAULTS[primitive] || {});
  p.objects = [{ id: 'obj', name: 'Obj', primitive, params: bag,
    transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' }];
  p.ground = { enabled: false };
  p.backdrop = { enabled: false };
  p.camera = clone(Params.DEFAULT_CAMERA);
  p.tone = { ...clone(defaults).tone, enabled: true };
  p.lights = [SUN];
  p.styleTable = { scene: { penId: null, mapper, params: { fillAngle: 45, fillDensity, toneLaw: LAW } }, byObject: {}, byFace: {} };
  return p;
};

(async () => {
  let overrides;
  if (args.src) overrides = { [REL_PATH]: fs.readFileSync(path.resolve(args.src), 'utf8') };
  const rt = await loadVecturaRuntime({ rootDir: ROOT, ...(overrides ? { scriptOverrides: overrides } : {}) });
  const V = rt.window.Vectura;
  const out = { root: ROOT, src: args.src || null, version: V.APP_VERSION || null, density: DENSITY, cells: {} };
  for (const rig of RIGS) {
    for (const [primitive, mapper] of CELLS) {
      const algo = V.AlgorithmRegistry.scene3d;
      const params = buildSceneParams(V.Scene3D.Params, V.ALGO_DEFAULTS.scene3d, { mapper, fillDensity: DENSITY, primitive, rig });
      const paths = algo.generate(params, null, null, BOUNDS);
      const stat = V.Scene3D.SurfaceFill.lastMarkStats || {};
      out.cells[`${rig}|${primitive}/${mapper}`] = {
        paths: (paths || []).map((pp) => {
          const arr = Array.isArray(pp) ? pp : (pp && pp.points) || [];
          const f = []; arr.forEach((pt) => { f.push(pt.x, pt.y); }); return f;
        }),
        rowPitch: stat.tickField ? stat.tickField.rowPitch : null,
        tickFieldPts: stat.tickField ? stat.tickField.pts : null,
        lenByThird: stat.lenByThird || null,
        cntByThird: stat.cntByThird || null,
        tickSites: stat.tickSites || null,
        marks: stat.marks || null,
      };
      process.stderr.write(`${rig}|${primitive}/${mapper}: paths=${paths.length} rowPitch=${out.cells[`${rig}|${primitive}/${mapper}`].rowPitch}\n`);
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(out));
  await rt.cleanup();
  process.exit(0);
})();
