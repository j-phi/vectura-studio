const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { thirdsSplit, contact } = require('../helpers/scene3d-mktick-spacing-tone');

const REL_PATH = 'src/core/scene3d/surface-fill.js';
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const BOUNDS = { width: 1200, height: 1000, m: 20, dW: 1160, dH: 960, penWidth: 0.3 };
const SUN = { id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false };
const clone = (value) => JSON.parse(JSON.stringify(value));
const HOOK_NEEDLE = 'if (si === mainIdx) mkStat.tickSites.push(sv.I, sv.R, sv.P, pieceLen ? 1 : 0);';
const HOOK_REPL = `if (si === mainIdx) {\n              mkStat.tickSites.push(sv.I, sv.R, sv.P, pieceLen ? 1 : 0);\n              if (typeof globalThis.__T27_SITE__ === 'function') globalThis.__T27_SITE__([sv.I, sv.R, sv.P, sv.L, pieceLen || 0]);\n            }`;

const buildHookedSource = () => {
  const src = fs.readFileSync(path.join(ROOT_DIR, REL_PATH), 'utf8');
  const count = src.split(HOOK_NEEDLE).length - 1;
  if (count !== 1) throw new Error(`mkTick hook needle count=${count}; expected one`);
  return src.replace(HOOK_NEEDLE, HOOK_REPL);
};

const buildParams = (V, primitive, fillDensity = 50) => {
  const Params = V.Scene3D.Params;
  const params = clone(V.ALGO_DEFAULTS.scene3d);
  const primitiveParams = clone(Params.PRIMITIVE_PARAM_DEFAULTS[primitive] || {});
  params.objects = [{
    id: 'obj', name: primitive, primitive, params: primitiveParams,
    transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
  }];
  params.ground = { enabled: false };
  params.backdrop = { enabled: false };
  params.camera = clone(Params.DEFAULT_CAMERA);
  params.tone = { ...clone(params.tone), enabled: true };
  params.lights = [SUN];
  params.styleTable = {
    scene: { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity, toneLaw: 'mkTick' } },
    byObject: {}, byFace: {},
  };
  return params;
};

describe('Scene3D.SurfaceFill — mkTick thin-width canaries (routine lane)', () => {
  test('thin-width mkTick remains tone-spaced on curved and faceted geometry', async () => {
    const runtime = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: buildHookedSource() } });
    try {
      const V = runtime.window.Vectura;
      const render = (primitive) => {
        const sites = [];
        runtime.window.__T27_SITE__ = (record) => sites.push(record);
        const paths = V.AlgorithmRegistry.scene3d.generate(buildParams(V, primitive), null, null, BOUNDS) || [];
        delete runtime.window.__T27_SITE__;
        const fills = paths.filter((path) => path.meta && path.meta.kind === 'sceneFill');
        return { sites, fills, stat: V.Scene3D.SurfaceFill.lastMarkStats };
      };

      const curved = render('sphere');
      expect(curved.sites.length).toBeGreaterThan(0);
      expect(curved.fills.length).toBeGreaterThan(0);
      const spacing = thirdsSplit(curved.sites, 1.0001);
      expect(spacing.SP5).toBeGreaterThanOrEqual(2.30);
      expect(spacing.SP5mono).toBe(true);
      expect(contact(curved.fills, BOUNDS.penWidth).tipContact).toBeLessThanOrEqual(0.15);

      // A box exercises scene3d.js's faceted fill path while the sphere above
      // exercises surface-fill.js's curved path. Keep only the output canary
      // here; full multi-cell contact and mutant proofs live in the audit.
      const faceted = render('box');
      expect(faceted.fills.length).toBeGreaterThan(0);
      expect(faceted.fills.some((path) => path.length >= 2)).toBe(true);
    } finally {
      delete runtime.window.__T27_SITE__;
      await runtime.cleanup();
    }
  }, 120000);
});
